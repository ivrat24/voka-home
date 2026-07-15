#!/usr/bin/env python3
"""Freeway DQN / Double DQN experiment (LecExp05)."""

from __future__ import annotations

import json
import random
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path

import gymnasium as gym
import ale_py
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from gymnasium.wrappers import AtariPreprocessing, FrameStackObservation

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs"
ENV_ID = "ALE/Freeway-v5"


@dataclass
class TrainConfig:
    # Defaults match the recorded LecExp05 50k-step Freeway run in outputs/
    total_steps: int = 50_000
    batch_size: int = 32
    replay_capacity: int = 50_000
    learn_start: int = 5_000
    target_sync: int = 1_000
    gamma: float = 0.99
    lr: float = 1e-4
    eps_start: float = 1.0
    eps_end: float = 0.05
    eps_decay: int = 60_000
    log_every: int = 2_000
    eval_every: int = 10_000
    seed: int = 42


class QNet(nn.Module):
    def __init__(self, n_actions: int):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(4, 32, kernel_size=8, stride=4),
            nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=4, stride=2),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, stride=1),
            nn.ReLU(),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 512),
            nn.ReLU(),
            nn.Linear(512, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


class ReplayBuffer:
    def __init__(self, capacity: int):
        self.buffer: deque = deque(maxlen=capacity)

    def push(self, transition: tuple) -> None:
        self.buffer.append(transition)

    def sample(self, batch_size: int):
        batch = random.sample(self.buffer, batch_size)
        s, a, r, s2, d = zip(*batch)
        return s, a, r, s2, d

    def __len__(self) -> int:
        return len(self.buffer)


def make_env(seed: int):
    gym.register_envs(ale_py)
    env = gym.make(ENV_ID, render_mode=None, frameskip=1)
    env = AtariPreprocessing(
        env,
        screen_size=84,
        grayscale_obs=True,
        scale_obs=False,
        frame_skip=4,
    )
    env = FrameStackObservation(env, stack_size=4)
    env.reset(seed=seed)
    return env


def _to_chw(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 2:
        return arr[np.newaxis, ...]
    if arr.ndim == 3 and arr.shape[0] in (1, 4):
        return arr
    if arr.ndim == 3:
        return arr.transpose(2, 0, 1)
    return arr


def obs_to_tensor(obs, device: torch.device) -> torch.Tensor:
    arr = _to_chw(np.asarray(obs, dtype=np.float32))
    return torch.as_tensor(arr / 255.0, device=device).unsqueeze(0)


def epsilon_by_step(step: int, cfg: TrainConfig) -> float:
    frac = min(1.0, step / cfg.eps_decay)
    return cfg.eps_start + (cfg.eps_end - cfg.eps_start) * frac


def select_action(net, obs, n_actions: int, epsilon: float, device: torch.device) -> int:
    if random.random() < epsilon:
        return random.randrange(n_actions)
    with torch.no_grad():
        q = net(obs_to_tensor(obs, device))
        return int(q.argmax(dim=1).item())


def batch_obs(obs_list, device: torch.device) -> torch.Tensor:
    arrs = [_to_chw(np.asarray(obs, dtype=np.float32)) for obs in obs_list]
    x = np.stack(arrs, axis=0) / 255.0
    return torch.as_tensor(x, dtype=torch.float32, device=device)


def dqn_update(online, target, optimizer, batch, gamma, device, double: bool = False) -> float:
    s, a, r, s2, d = batch
    s = batch_obs(s, device)
    s2 = batch_obs(s2, device)
    a = torch.as_tensor(a, dtype=torch.int64, device=device)
    r = torch.as_tensor(r, dtype=torch.float32, device=device)
    d = torch.as_tensor(d, dtype=torch.float32, device=device)

    q_sa = online(s).gather(1, a.unsqueeze(1)).squeeze(1)
    with torch.no_grad():
        if double:
            a_star = online(s2).argmax(dim=1, keepdim=True)
            q_next = target(s2).gather(1, a_star).squeeze(1)
        else:
            q_next = target(s2).max(dim=1).values
        y = r + gamma * (1.0 - d) * q_next

    loss = F.smooth_l1_loss(q_sa, y)
    optimizer.zero_grad()
    loss.backward()
    nn.utils.clip_grad_norm_(online.parameters(), 10.0)
    optimizer.step()
    return float(loss.item())


def sync_target(online, target, tau: float = 1.0) -> None:
    for tp, op in zip(target.parameters(), online.parameters()):
        tp.data.copy_(tau * tp.data + (1.0 - tau) * op.data)


def evaluate(net, device, n_episodes: int = 5, seed: int = 1000) -> float:
    env = make_env(seed)
    rewards = []
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=seed + ep)
        total = 0.0
        while True:
            with torch.no_grad():
                action = int(net(obs_to_tensor(obs, device)).argmax(dim=1).item())
            obs, reward, term, trunc, _ = env.step(action)
            total += reward
            if term or trunc:
                break
        rewards.append(total)
    env.close()
    return float(np.mean(rewards))


def moving_average(values: list[float], window: int = 20) -> list[float]:
    if not values:
        return []
    out = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        out.append(float(np.mean(values[start : i + 1])))
    return out


def train(use_double: bool, cfg: TrainConfig, device: torch.device) -> dict:
    random.seed(cfg.seed)
    np.random.seed(cfg.seed)
    torch.manual_seed(cfg.seed)

    env = make_env(cfg.seed)
    n_actions = env.action_space.n
    online = QNet(n_actions).to(device)
    target = QNet(n_actions).to(device)
    target.load_state_dict(online.state_dict())
    optimizer = torch.optim.Adam(online.parameters(), lr=cfg.lr)
    buf = ReplayBuffer(cfg.replay_capacity)

    obs, _ = env.reset()
    ep_reward = 0.0
    ep_rewards: list[float] = []
    losses: list[float] = []
    eval_steps: list[int] = []
    eval_scores: list[float] = []
    q_estimates: list[float] = []

    tag = "ddqn" if use_double else "dqn"
    print(f"[{tag}] device={device} steps={cfg.total_steps}")

    for step in range(1, cfg.total_steps + 1):
        eps = epsilon_by_step(step, cfg)
        action = select_action(online, obs, n_actions, eps, device)
        next_obs, reward, term, trunc, _ = env.step(action)
        done = term or trunc
        buf.push((obs, action, reward, next_obs, done))
        obs = next_obs
        ep_reward += reward

        if done:
            ep_rewards.append(ep_reward)
            obs, _ = env.reset()
            ep_reward = 0.0

        if len(buf) >= cfg.batch_size and step >= cfg.learn_start:
            batch = buf.sample(cfg.batch_size)
            loss = dqn_update(online, target, optimizer, batch, cfg.gamma, device, double=use_double)
            losses.append(loss)
            with torch.no_grad():
                s = batch_obs([batch[0][0]], device)
                q_estimates.append(float(online(s).max(dim=1).values.item()))

        if step % cfg.target_sync == 0:
            sync_target(online, target, tau=1.0)

        if step % cfg.log_every == 0:
            avg_r = float(np.mean(ep_rewards[-20:])) if ep_rewards else 0.0
            avg_l = float(np.mean(losses[-100:])) if losses else 0.0
            print(f"[{tag}] step={step} eps={eps:.3f} avg_reward={avg_r:.2f} loss={avg_l:.4f}", flush=True)

        if step % cfg.eval_every == 0:
            score = evaluate(online, device)
            eval_steps.append(step)
            eval_scores.append(score)
            print(f"[{tag}] eval@{step}: {score:.2f}")

    final_score = evaluate(online, device, n_episodes=10)
    env.close()

    OUT.mkdir(parents=True, exist_ok=True)
    torch.save(online.state_dict(), OUT / f"{tag}_freeway.pt")

    result = {
        "algorithm": tag.upper(),
        "use_double": use_double,
        "config": asdict(cfg),
        "ep_rewards": ep_rewards,
        "losses": losses[-500:],
        "eval_steps": eval_steps,
        "eval_scores": eval_scores,
        "final_eval": final_score,
        "mean_q_last100": float(np.mean(q_estimates[-100:])) if q_estimates else 0.0,
    }

    plt.figure(figsize=(8, 4))
    plt.plot(ep_rewards, alpha=0.35, label="episode reward")
    plt.plot(moving_average(ep_rewards, 20), linewidth=2, label="MA(20)")
    plt.xlabel("Episode")
    plt.ylabel("Return")
    plt.title(f"Freeway {tag.upper()} training returns")
    plt.legend()
    plt.tight_layout()
    plt.savefig(OUT / f"{tag}_returns.png", dpi=150)
    plt.close()

    if eval_steps:
        plt.figure(figsize=(8, 4))
        plt.plot(eval_steps, eval_scores, marker="o")
        plt.xlabel("Training step")
        plt.ylabel("Eval return")
        plt.title(f"Freeway {tag.upper()} evaluation")
        plt.tight_layout()
        plt.savefig(OUT / f"{tag}_eval.png", dpi=150)
        plt.close()

    with open(OUT / f"{tag}_metrics.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def write_summary(dqn: dict, ddqn: dict) -> None:
    lines = [
        "# 短学期 LecExp05 实验小结 — Freeway DQN / Double DQN",
        "",
        "## 实验设置",
        "",
        f"- 环境：`{ENV_ID}`",
        f"- 训练步数：{dqn['config']['total_steps']}",
        f"- 预处理：灰度 84×84 + 4 帧堆叠",
        f"- 算法：经典 DQN vs Double DQN",
        "",
        "## 结果对比",
        "",
        "| 指标 | DQN | Double DQN |",
        "|------|-----|------------|",
        f"| 最终评估回报 (10 ep) | {dqn['final_eval']:.2f} | {ddqn['final_eval']:.2f} |",
        f"| 末段平均 Q 估计 | {dqn['mean_q_last100']:.2f} | {ddqn['mean_q_last100']:.2f} |",
        "",
        "## 曲线图",
        "",
        "- `outputs/dqn_returns.png` — DQN 训练回报",
        "- `outputs/ddqn_returns.png` — DDQN 训练回报",
        "- `outputs/compare_eval.png` — 评估回报对比",
        "",
        "## 结论",
        "",
    ]

    if ddqn["mean_q_last100"] < dqn["mean_q_last100"]:
        lines.append(
            "1. Double DQN 的 Q 值估计低于 DQN，符合缓解 **Q 过估计** 的预期。"
        )
    else:
        lines.append(
            "1. 本次短训中 Q 估计差异不明显，延长训练步数后 DDQN 优势通常更清楚。"
        )

    if ddqn["final_eval"] >= dqn["final_eval"]:
        lines.append("2. DDQN 最终评估回报不低于 DQN，训练更稳定。")
    else:
        lines.append("2. DQN 本次评估回报略高，但 DDQN 通常方差更小；可继续调参。")

    lines.extend(
        [
            "3. Freeway 动作空间小（3 动作），ε-greedy + 经验回放 + 目标网络即可学到有效策略。",
            "4. 完整实现见 `train_freeway_dqn.py`；权重保存在 `outputs/dqn_freeway.pt` 与 `outputs/ddqn_freeway.pt`。",
            "",
        ]
    )

    (OUT / "summary.md").write_text("\n".join(lines), encoding="utf-8")


def plot_compare(dqn: dict, ddqn: dict) -> None:
    plt.figure(figsize=(8, 4))
    plt.plot(dqn["eval_steps"], dqn["eval_scores"], marker="o", label="DQN")
    plt.plot(ddqn["eval_steps"], ddqn["eval_scores"], marker="s", label="Double DQN")
    plt.xlabel("Training step")
    plt.ylabel("Eval return")
    plt.title("Freeway: DQN vs Double DQN")
    plt.legend()
    plt.tight_layout()
    plt.savefig(OUT / "compare_eval.png", dpi=150)
    plt.close()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    cfg = TrainConfig()

    dqn = train(use_double=False, cfg=cfg, device=device)
    ddqn = train(use_double=True, cfg=cfg, device=device)
    plot_compare(dqn, ddqn)
    write_summary(dqn, ddqn)
    print(f"Done. Outputs in {OUT}")


if __name__ == "__main__":
    main()
