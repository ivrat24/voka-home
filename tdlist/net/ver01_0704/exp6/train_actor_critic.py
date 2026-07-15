#!/usr/bin/env python3
"""LecExp06 — Monte Carlo Actor-Critic on CartPole + Atari.

Implements the course notebook pipeline (shared encoder + dual heads,
A_t = G_t - V(s), entropy bonus), with optional Atari preprocessing for
stable Freeway / Pong runs.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import ale_py
import gymnasium as gym
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from gymnasium.wrappers import AtariPreprocessing, FrameStackObservation
from torch.distributions import Categorical

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs"
STATIC = ROOT.parent / "site" / "static" / "exp6"

gym.register_envs(ale_py)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


@dataclass
class ACConfig:
    total_episodes: int = 200
    max_steps_per_episode: int = 1000
    gamma: float = 0.99
    lr: float = 1e-3
    value_coef: float = 0.5
    entropy_coef: float = 0.01
    grad_clip_norm: float = 10.0
    normalize_adv: bool = True
    # Atari-only
    preprocess: bool = False
    eval_every: int = 25
    eval_episodes: int = 5
    seed: int = 2026


def make_env(env_id: str, *, preprocess: bool = False, render_mode=None):
    if preprocess and env_id.startswith("ALE/"):
        env = gym.make(env_id, render_mode=render_mode, frameskip=1)
        env = AtariPreprocessing(
            env,
            screen_size=84,
            grayscale_obs=True,
            scale_obs=False,
            frame_skip=4,
        )
        env = FrameStackObservation(env, stack_size=4)
        return env
    return gym.make(env_id, render_mode=render_mode)


def _to_chw(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 2:
        return arr[np.newaxis, ...]
    if arr.ndim == 3 and arr.shape[0] in (1, 3, 4):
        return arr
    if arr.ndim == 3:
        return arr.transpose(2, 0, 1)
    return arr


def obs_to_tensor(obs, device=DEVICE) -> torch.Tensor:
    arr = np.asarray(obs)
    if arr.ndim >= 2 and (arr.ndim == 3 or (arr.ndim == 2)):
        arr = _to_chw(arr.astype(np.float32))
        if arr.max() > 1.5:
            arr = arr / 255.0
    else:
        arr = arr.astype(np.float32)
    return torch.as_tensor(arr, device=device).unsqueeze(0)


class ActorCriticNet(nn.Module):
    def __init__(self, sample_obs, action_dim: int):
        super().__init__()
        sample = obs_to_tensor(sample_obs, device=torch.device("cpu"))
        self.is_image = sample.ndim == 4
        if self.is_image:
            c = sample.shape[1]
            self.encoder = nn.Sequential(
                nn.Conv2d(c, 32, kernel_size=8, stride=4),
                nn.ReLU(),
                nn.Conv2d(32, 64, kernel_size=4, stride=2),
                nn.ReLU(),
                nn.Conv2d(64, 64, kernel_size=3, stride=1),
                nn.ReLU(),
                nn.Flatten(),
            )
            with torch.no_grad():
                hidden_dim = self.encoder(sample).shape[1]
            self.shared = nn.Sequential(nn.Linear(hidden_dim, 256), nn.ReLU())
            shared_dim = 256
        else:
            input_dim = sample.shape[1]
            self.encoder = nn.Identity()
            self.shared = nn.Sequential(
                nn.Linear(input_dim, 128),
                nn.ReLU(),
                nn.Linear(128, 128),
                nn.ReLU(),
            )
            shared_dim = 128
        self.policy_head = nn.Linear(shared_dim, action_dim)
        self.value_head = nn.Linear(shared_dim, 1)

    def forward(self, x: torch.Tensor):
        z = self.shared(self.encoder(x))
        return self.policy_head(z), self.value_head(z).squeeze(-1)


def compute_discounted_returns(rewards, gamma: float) -> torch.Tensor:
    returns = []
    running = 0.0
    for reward in reversed(rewards):
        running = float(reward) + gamma * running
        returns.append(running)
    returns.reverse()
    return torch.as_tensor(returns, dtype=torch.float32, device=DEVICE)


def select_ac_action(model: ActorCriticNet, obs):
    obs_t = obs_to_tensor(obs)
    logits, value = model(obs_t)
    dist = Categorical(logits=logits)
    action = dist.sample()
    return (
        int(action.item()),
        dist.log_prob(action).squeeze(0),
        value.squeeze(0),
        dist.entropy().squeeze(0),
    )


def update_actor_critic(model, optimizer, log_probs, values, rewards, entropies, cfg: ACConfig):
    if not rewards:
        return None, {}
    returns = compute_discounted_returns(rewards, cfg.gamma)
    values_t = torch.stack(values)
    log_probs_t = torch.stack(log_probs)
    entropies_t = torch.stack(entropies)

    advantages = returns - values_t.detach()
    if cfg.normalize_adv and len(advantages) > 1:
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    policy_loss = -(log_probs_t * advantages).mean()
    value_loss = F.mse_loss(values_t, returns)
    entropy_loss = -entropies_t.mean()
    loss = policy_loss + cfg.value_coef * value_loss + cfg.entropy_coef * entropy_loss

    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip_norm)
    optimizer.step()
    return float(loss.item()), {
        "policy_loss": float(policy_loss.item()),
        "value_loss": float(value_loss.item()),
        "entropy": float(entropies_t.mean().item()),
    }


@torch.no_grad()
def evaluate(model: ActorCriticNet, env_id: str, cfg: ACConfig, seed: int) -> float:
    env = make_env(env_id, preprocess=cfg.preprocess)
    scores = []
    for ep in range(cfg.eval_episodes):
        obs, _ = env.reset(seed=seed + 10_000 + ep)
        total = 0.0
        for _ in range(cfg.max_steps_per_episode):
            obs_t = obs_to_tensor(obs)
            logits, _ = model(obs_t)
            action = int(logits.argmax(dim=1).item())
            obs, reward, term, trunc, _ = env.step(action)
            total += float(reward)
            if term or trunc:
                break
        scores.append(total)
    env.close()
    return float(np.mean(scores))


def moving_average(values, window=20):
    values = np.asarray(values, dtype=np.float32)
    if len(values) == 0:
        return values
    window = max(1, int(window))
    if len(values) < window:
        return np.full_like(values, values.mean())
    kernel = np.ones(window, dtype=np.float32) / window
    prefix = np.full(window - 1, values[:window].mean(), dtype=np.float32)
    return np.concatenate([prefix, np.convolve(values, kernel, mode="valid")])


def plot_history(history, title: str, path: Path, window: int = 20):
    fig, axes = plt.subplots(2, 2, figsize=(12, 7))
    items = [
        ("return", "Episode return"),
        ("length", "Episode length"),
        ("loss", "Loss"),
        ("eval", "Eval return"),
    ]
    for ax, (key, label) in zip(axes.ravel(), items):
        if key == "eval":
            xs = history.get("eval_episodes", [])
            ys = history.get("eval_scores", [])
            if not xs:
                ax.set_title(f"{label} (no data)")
                ax.axis("off")
                continue
            ax.plot(xs, ys, marker="o", color="#F58518")
            ax.set_title(label)
            ax.grid(True, alpha=0.3)
            continue
        values = history.get(key, [])
        if not values:
            ax.set_title(f"{label} (no data)")
            ax.axis("off")
            continue
        ax.plot(values, alpha=0.25, color="#4C78A8")
        ax.plot(moving_average(values, window), color="#F58518", linewidth=2)
        ax.set_title(label)
        ax.grid(True, alpha=0.3)
    fig.suptitle(title)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=140)
    plt.close(fig)


def plot_action_distribution(actions, title: str, path: Path):
    counts = Counter(actions)
    labels = sorted(counts)
    values = [counts[x] for x in labels]
    fig, ax = plt.subplots(figsize=(7, 3.5))
    ax.bar([str(x) for x in labels], values, color="#54A24B")
    ax.set_title(title)
    ax.set_xlabel("Action")
    ax.set_ylabel("Count")
    ax.grid(True, axis="y", alpha=0.3)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=140)
    plt.close(fig)


def train_actor_critic(env_id: str, cfg: ACConfig, tag: str):
    random.seed(cfg.seed)
    np.random.seed(cfg.seed)
    torch.manual_seed(cfg.seed)

    env = make_env(env_id, preprocess=cfg.preprocess)
    obs, _ = env.reset(seed=cfg.seed)
    model = ActorCriticNet(obs, env.action_space.n).to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=cfg.lr)

    history = {
        "return": [],
        "length": [],
        "loss": [],
        "policy_loss": [],
        "value_loss": [],
        "entropy": [],
        "eval_episodes": [],
        "eval_scores": [],
    }
    all_actions: list[int] = []

    print(f"=== Training AC on {env_id} ({tag}) device={DEVICE} preprocess={cfg.preprocess} ===")
    for episode in range(cfg.total_episodes):
        obs, _ = env.reset(seed=cfg.seed + episode)
        rewards, log_probs, values, entropies = [], [], [], []
        episode_return = 0.0
        step = 0
        for step in range(cfg.max_steps_per_episode):
            action, log_prob, value, entropy = select_ac_action(model, obs)
            next_obs, reward, terminated, truncated, _ = env.step(action)
            rewards.append(float(reward))
            log_probs.append(log_prob)
            values.append(value)
            entropies.append(entropy)
            all_actions.append(int(action))
            episode_return += float(reward)
            obs = next_obs
            if terminated or truncated:
                break

        loss, parts = update_actor_critic(
            model, optimizer, log_probs, values, rewards, entropies, cfg
        )
        if loss is not None:
            history["loss"].append(loss)
            history["policy_loss"].append(parts["policy_loss"])
            history["value_loss"].append(parts["value_loss"])
            history["entropy"].append(parts["entropy"])
        history["return"].append(episode_return)
        history["length"].append(step + 1)

        if (episode + 1) % 5 == 0 or episode == 0:
            recent = np.mean(history["return"][-min(10, len(history["return"])) :])
            print(
                f"[{tag}] ep={episode + 1}/{cfg.total_episodes} "
                f"recent_return={recent:.2f} len={step + 1}",
                flush=True,
            )

        if cfg.eval_every > 0 and (episode + 1) % cfg.eval_every == 0:
            score = evaluate(model, env_id, cfg, cfg.seed)
            history["eval_episodes"].append(episode + 1)
            history["eval_scores"].append(score)
            print(f"[{tag}] eval@{episode + 1}: {score:.2f}")

    env.close()

    final_eval = evaluate(model, env_id, cfg, cfg.seed + 999)
    history["final_eval"] = final_eval
    print(f"[{tag}] final_eval={final_eval:.2f}")

    OUT.mkdir(parents=True, exist_ok=True)
    STATIC.mkdir(parents=True, exist_ok=True)
    stem = tag.replace("/", "_")
    weight_path = OUT / f"{stem}.pt"
    torch.save({"model": model.state_dict(), "env_id": env_id, "config": asdict(cfg)}, weight_path)

    metrics = {
        "env_id": env_id,
        "tag": tag,
        "config": asdict(cfg),
        "final_eval": final_eval,
        "mean_return_last10": float(np.mean(history["return"][-10:])),
        "mean_return_last50": float(np.mean(history["return"][-min(50, len(history["return"])) :])),
        "best_train_return": float(np.max(history["return"])) if history["return"] else 0.0,
        "action_counts": {str(k): int(v) for k, v in Counter(all_actions).items()},
        "history": {
            "return": history["return"],
            "length": history["length"],
            "loss": history["loss"],
            "eval_episodes": history["eval_episodes"],
            "eval_scores": history["eval_scores"],
        },
    }
    (OUT / f"{stem}_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    plot_history(history, f"Actor-Critic on {env_id}", OUT / f"{stem}_returns.png")
    plot_action_distribution(
        all_actions, f"Action distribution — {env_id}", OUT / f"{stem}_actions.png"
    )
    for name in (f"{stem}_returns.png", f"{stem}_actions.png"):
        src = OUT / name
        if src.exists():
            (STATIC / name).write_bytes(src.read_bytes())

    return model, history, metrics


def write_summary(all_metrics: list[dict]):
    lines = [
        "# 短学期 LecExp06 实验小结 — Actor-Critic",
        "",
        "## 算法",
        "",
        "- Monte Carlo Actor-Critic：共享编码器 + 策略头 / 价值头",
        "- Advantage：`A_t = G_t - V(s_t)`（策略损失对 V 停止梯度）",
        "- 总损失：`L = L_pi + c_v L_V + c_e (-H)`",
        "",
        "## 结果",
        "",
        "| 环境 | episodes | final_eval | 末 10 局均值 | 训练最佳 |",
        "|------|----------|------------|--------------|----------|",
    ]
    for m in all_metrics:
        lines.append(
            f"| `{m['env_id']}` | {m['config']['total_episodes']} | "
            f"**{m['final_eval']:.2f}** | {m['mean_return_last10']:.2f} | {m['best_train_return']:.2f} |"
        )
    lines.extend(
        [
            "",
            "## 结论",
            "",
            "1. CartPole 用于验证实现：AC 能在向量观测上稳定学到平衡策略。",
            "2. Atari（Freeway / Pong）采用 84×84 灰度 + 4 帧堆叠，短训下观察回报趋势与动作分布。",
            "3. 与 DQN 的差异：直接优化随机策略；探索靠策略熵而非 ε-greedy；按 episode 更新。",
            "",
        ]
    )
    text = "\n".join(lines)
    (OUT / "summary.md").write_text(text, encoding="utf-8")
    (STATIC / "summary.md").write_text(text, encoding="utf-8")
    print(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--suite",
        choices=["cartpole", "freeway", "pong", "all"],
        default="all",
    )
    args = parser.parse_args()

    runs: list[tuple[str, str, ACConfig]] = []
    if args.suite in ("cartpole", "all"):
        runs.append(
            (
                "CartPole-v1",
                "cartpole",
                ACConfig(
                    total_episodes=300,
                    max_steps_per_episode=500,
                    lr=1e-3,
                    entropy_coef=0.01,
                    preprocess=False,
                    eval_every=25,
                    seed=2026,
                ),
            )
        )
    if args.suite in ("freeway", "all"):
        runs.append(
            (
                "ALE/Freeway-v5",
                "freeway",
                ACConfig(
                    total_episodes=40,
                    max_steps_per_episode=500,
                    lr=1e-4,
                    entropy_coef=0.02,
                    preprocess=True,
                    eval_every=10,
                    eval_episodes=2,
                    seed=3026,
                ),
            )
        )
    if args.suite in ("pong", "all"):
        runs.append(
            (
                "ALE/Pong-v5",
                "pong",
                ACConfig(
                    total_episodes=40,
                    max_steps_per_episode=500,
                    lr=1e-4,
                    entropy_coef=0.02,
                    preprocess=True,
                    eval_every=10,
                    eval_episodes=2,
                    seed=4026,
                ),
            )
        )

    all_metrics = []
    for env_id, tag, cfg in runs:
        _, _, metrics = train_actor_critic(env_id, cfg, tag)
        all_metrics.append(metrics)
    write_summary(all_metrics)
    print(f"Done. Outputs -> {OUT}")


if __name__ == "__main__":
    main()
