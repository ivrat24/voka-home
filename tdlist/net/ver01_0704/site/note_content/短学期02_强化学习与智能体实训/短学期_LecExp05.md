---
title: 短学期 LecExp05
date: 2026-07-12
tags: [强化学习, DQN, DDQN, Atari, Freeway, 短学期, 实验]
description: Atari Freeway 上经典 DQN 与 Double DQN 实现、训练循环与超参速查
---

#rat1#
## 实验目标

1. 手写经典 **DQN**（经验回放 + 目标网络）
2. 在 Atari **Freeway-v5**（或 `ALE/Freeway-v5`）上测试
3. **作业**：改为 **Double DQN**
4. **可选**：Dueling DQN

**前置**：[Lec05](短学期_Lec05.html) 理论、[Lec03 特刊-PyTorch](短学期_Lec03特刊-PyTorch.html) CNN 与优化器。

#rat2#
## 环境与依赖

```bash
conda activate rl-course
pip install gymnasium[atari,accept-rom-license] ale-py torch torchvision
```

```python
import gymnasium as gym
import ale_py

gym.register_envs(ale_py)
ENV_ID = "ALE/Freeway-v5"   # 或 Freeway-v5
```

| 项目 | Freeway 典型设置 |
|------|------------------|
| 观测 | 210×160×3 RGB（需预处理） |
| 动作 | `Discrete(3)`：NOOP / UP / DOWN |
| 目标 | 控制小鸡过马路，躲车得分 |

### 创建环境（带预处理 wrapper）

```python
env = gym.make(ENV_ID, render_mode=None, frameskip=4)
obs, info = env.reset(seed=42)
print(obs.shape, env.action_space)  # (210,160,3), Discrete(3)
env.close()
```

**DQN 常用预处理**（与 Mnih 2013 一致）：

1. 灰度化
2. 缩放到 84×84
3. 堆叠最近 4 帧 → 输入 shape `(4, 84, 84)`

可用 `gymnasium.wrappers` 或自定义 `FrameStack` / `GrayScaleObservation`。

#rat1#
## 网络结构（CNN Q 网络）

```python
import torch
import torch.nn as nn

class QNet(nn.Module):
    def __init__(self, n_actions):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(4, 32, kernel_size=8, stride=4), nn.ReLU(),
            nn.Conv2d(32, 64, kernel_size=4, stride=2), nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, stride=1), nn.ReLU(),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 512), nn.ReLU(),
            nn.Linear(512, n_actions),
        )

    def forward(self, x):
        return self.head(self.features(x))
```

输出为每个动作的 Q 值，**无 Softmax**（见 Lec03）。

#rat2#
## 经验回放

```python
import random
from collections import deque

class ReplayBuffer:
    def __init__(self, capacity=100_000):
        self.buffer = deque(maxlen=capacity)

    def push(self, transition):
        # transition: (s, a, r, s', done)
        self.buffer.append(transition)

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        s, a, r, s2, d = zip(*batch)
        return s, a, r, s2, d

    def __len__(self):
        return len(self.buffer)
```

#rat1#
## 经典 DQN 更新（单步）

```python
import torch.nn.functional as F

def dqn_update(online_net, target_net, optimizer, batch, gamma=0.99, device="cpu"):
    s, a, r, s2, d = batch
    s  = torch.as_tensor(s,  dtype=torch.float32, device=device)
    a  = torch.as_tensor(a,  dtype=torch.int64,   device=device)
    r  = torch.as_tensor(r,  dtype=torch.float32, device=device)
    s2 = torch.as_tensor(s2, dtype=torch.float32, device=device)
    d  = torch.as_tensor(d,  dtype=torch.float32, device=device)

    q_sa = online_net(s).gather(1, a.unsqueeze(1)).squeeze(1)

    with torch.no_grad():
        # DQN: 目标网络选动作且估 Q（同一 Q_{ω^-}）
        q_next = target_net(s2).max(dim=1).values
        y = r + gamma * (1.0 - d) * q_next

    loss = F.mse_loss(q_sa, y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    return loss.item()
```

#rat2#
## Double DQN 更新（作业）

**改动仅 TD target 一行**——在线网络选 \(a'\)，目标网络估 Q：

```python
    with torch.no_grad():
        a_star = online_net(s2).argmax(dim=1, keepdim=True)
        q_next = target_net(s2).gather(1, a_star).squeeze(1)
        y = r + gamma * (1.0 - d) * q_next
```

| 版本 | \(\arg\max\) 用谁 | \(Q(s',a')\) 用谁 |
|------|------------------|-------------------|
| DQN | \(Q_{\omega^-}\) | \(Q_{\omega^-}\) |
| **DDQN** | \(Q_{\omega}\) | \(Q_{\omega^-}\) |

#rat1#
## ε-greedy 与目标网络同步

```python
def epsilon_by_step(step, eps_start=1.0, eps_end=0.01, eps_decay=250_000):
    return max(eps_end, eps_start - (eps_start - eps_end) * step / eps_decay)

def select_action(q_net, obs, n_actions, epsilon, device):
    if random.random() < epsilon:
        return random.randrange(n_actions)
    with torch.no_grad():
        q = q_net(torch.as_tensor(obs, device=device).unsqueeze(0))
        return int(q.argmax(dim=1).item())

def sync_target(online, target, tau=1.0):
    # tau=1.0 硬更新；tau=0.99 软更新
    for tp, op in zip(target.parameters(), online.parameters()):
        tp.data.copy_(tau * tp.data + (1 - tau) * op.data)
```

#rat2#
## 训练主循环（骨架）

```python
def train_dqn(
    env_id=ENV_ID,
    total_steps=200_000,
    batch_size=32,
    learn_start=10_000,
    target_sync=1_000,
    gamma=0.99,
    lr=1e-4,
    device="cuda" if torch.cuda.is_available() else "cpu",
    use_double=False,
):
    env = gym.make(env_id)
    n_actions = env.action_space.n
    online = QNet(n_actions).to(device)
    target = QNet(n_actions).to(device)
    target.load_state_dict(online.state_dict())
    opt = torch.optim.Adam(online.parameters(), lr=lr)
    buf = ReplayBuffer()

    obs, _ = env.reset()
    ep_reward = 0.0

    for step in range(1, total_steps + 1):
        eps = epsilon_by_step(step)
        action = select_action(online, obs, n_actions, eps, device)
        next_obs, reward, term, trunc, _ = env.step(action)
        done = term or trunc
        buf.push((obs, action, reward, next_obs, done))
        obs = next_obs
        ep_reward += reward

        if done:
            obs, _ = env.reset()
            ep_reward = 0.0

        if len(buf) >= batch_size and step >= learn_start:
            batch = buf.sample(batch_size)
            if use_double:
                ddqn_update(online, target, opt, batch, gamma, device)
            else:
                dqn_update(online, target, opt, batch, gamma, device)

        if step % target_sync == 0:
            sync_target(online, target, tau=1.0)

    env.close()
    return online
```

#rat1#
## 超参建议（Freeway 起步）

| 超参 | 建议值 |
|------|--------|
| `total_steps` | 200k–1M |
| `batch_size` | 32 |
| `replay capacity` | 100k |
| `learn_start` | 10k（先攒 buffer） |
| `target_sync` | 1000 步 |
| `gamma` | 0.99 |
| `lr` | 1e-4（Adam） |
| `epsilon` | 1.0 → 0.01，线性衰减 |

Freeway 相对简单，可较快看到分数上升；Pong、Breakout 更难，作扩展尝试。

#rat2#
## 评估与调试

```python
def evaluate(q_net, env_id, n_episodes=5, device="cpu"):
    env = gym.make(env_id)
    rewards = []
    for ep in range(n_episodes):
        obs, _ = env.reset(seed=1000 + ep)
        total = 0.0
        while True:
            action = select_action(q_net, obs, env.action_space.n, epsilon=0.0, device=device)
            obs, r, term, trunc, _ = env.step(action)
            total += r
            if term or trunc:
                break
        rewards.append(total)
    env.close()
    return sum(rewards) / len(rewards)
```

| 现象 | 排查 |
|------|------|
| loss 不降 | `learn_start` 是否过小；学习率；预处理 |
| Q 爆炸 | 梯度裁剪 `clip_grad_norm_`；reward clip |
| 回报始终很低 | ε 衰减太快；训练步数不足 |
| DDQN 更稳 | 对比 DQN/DDQN 曲线 Q 过估计 |

#rat2#
## 作业与可选

| 任务 | 要求 |
|------|------|
| **必做** | 完整 DQN + Freeway 跑通 |
| **作业** | 改 `use_double=True` 或单独 `ddqn_update`，对比曲线 |
| **可选** | Dueling 头：`Q = V(s) + A(s,a) - mean(A)`，见 Lec05 |

**提交建议**：训练曲线（回报 vs step）、DQN vs DDQN 对比图、简短结论（是否缓解 Q 过估计）。

#rat1#
## 实验结果（Freeway 实测）

**代码与输出目录**：`tdlist/net/ver01_0704/exp5/`

| 文件 | 说明 |
|------|------|
| `train_freeway_dqn.py` | 完整 DQN + DDQN 训练脚本 |
| `outputs/dqn_returns.png` | DQN 训练回报曲线 |
| `outputs/ddqn_returns.png` | DDQN 训练回报曲线 |
| `outputs/compare_eval.png` | 评估回报对比 |
| `outputs/summary.md` | 实验小结 |
| `outputs/dqn_freeway.pt` / `ddqn_freeway.pt` | 模型权重 |

### 实验设置

| 超参 | 取值 |
|------|------|
| 环境 | `ALE/Freeway-v5` |
| 训练步数 | 25,000 × 2（DQN / DDQN 各一轮） |
| 预处理 | AtariPreprocessing 84×84 灰度 + 4 帧堆叠 |
| batch | 32，replay 30k，learn_start 2k |
| ε | 1.0 → 0.05，20k 步线性衰减 |
| 优化器 | Adam 1e-4，Huber loss，梯度裁剪 10 |

### 评估对比

| 指标 | DQN | Double DQN |
|------|-----|------------|
| 最终评估（10 ep 贪心） | **9.60** | 0.00 |
| 训练中最佳 eval | 14.20 @ 10k | **22.40** @ 15k/20k |
| 末段平均 Q 估计 | 0.013 | -0.017 |

> Freeway 单局得分即过马路次数；随机策略约 0，训练后 DQN/DDQN 均可达到 10+。

### 观察

1. **DQN** 在 10k 步 eval 达 14.2，最终评估 9.6，已学会基本过马路策略。
2. **DDQN** 中期 eval 更高（22.4），但最终贪心评估波动大（0.0）——短训 + ε 已衰减时策略尚不稳定，延长步数通常更稳。
3. DDQN 末段 Q 估计略低于 DQN，与 **缓解 Q 过估计** 的方向一致。
4. 必做项（手写 DQN + Freeway 跑通）与作业项（DDQN 对比）均已完成。

#rat2#
## 小结

| 模块 | 要点 |
|------|------|
| 环境 | Freeway，3 动作，84×84×4 输入 |
| DQN | Replay + Target Net + ε-greedy → 有效策略 |
| DDQN | 在线网络选动作、目标网络估 Q → Q 更保守 |
| 工程 | `AtariPreprocessing` + `FrameStackObservation`；注意 obs 为 CHW `(4,84,84)` |
| 输出 | 见 `exp5/outputs/`，含曲线图、权重、小结 |

**运行复现**：

```bash
cd tdlist/net/ver01_0704/exp5
python train_freeway_dqn.py
```

**一句话**：Freeway 上 DQN 可学得过马路；DDQN 中期 eval 更优、Q 估计更保守，完整对比需更长训练。
