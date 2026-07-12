---
title: 短学期 LecExp04
date: 2026-07-12
tags: [具身智能, MuJoCo, MuJoCo Warp, 人型机器人, 短学期, 实验]
description: MuJoCo Warp 人型机器人平地行走——观测/动作空间、并行仿真与 Gymnasium 接口速查
---

#rat1#
## 实验目标

完成 **MuJoCo Warp** 环境下**人型机器人平地行走**实验，理解：

1. 人型模型相对 CartPole 的**高维观测与连续动作**
2. **GPU 并行**（`nworld`）在腿足 RL 中的意义
3. 行走任务的**奖励、终止条件**与基线策略测试

**前置**：已完成 [LecExp01](短学期_LecExp01.html)（CartPole + Warp 入门）与 [Lec04](短学期_Lec04.html) 理论部分。

**硬件**：NVIDIA GPU + CUDA。

#rat2#
## 环境准备

与 LecExp01 相同依赖：

```bash
conda activate rl-course
pip install mujoco mujoco-warp warp-lang gymnasium Pillow matplotlib numpy notebook
```

| 库 | 用途 |
|----|------|
| `mujoco` | 加载人型 MJCF、CPU 调试 |
| `mujoco-warp` | GPU 并行物理步进 |
| `warp-lang` | Warp array / `wp.synchronize()` |
| `gymnasium` | 标准 RL 接口（可选 Humanoid 环境） |

#rat1#
## 方案 A：Gymnasium Humanoid（快速理解任务）

Gymnasium 内置 `Humanoid-v4` / `Humanoid-v5`（MuJoCo 后端），适合先理解**观测维数、动作范围、奖励逻辑**。

### 创建与单步

```python
import gymnasium as gym

ENV_ID = "Humanoid-v4"   # 或 Humanoid-v5
env = gym.make(ENV_ID, render_mode=None)
obs, info = env.reset(seed=42)

print("obs shape:", obs.shape)       # 例如 (376,)
print("action space:", env.action_space)  # Box(17,) 连续力矩

action = env.action_space.sample()
obs, reward, terminated, truncated, info = env.step(action)
done = terminated or truncated
env.close()
```

### 观测与动作（典型）

| 项目 | Humanoid-v4 典型值 | 含义 |
|------|-------------------|------|
| 观测维数 | 376 | 关节角/速、质心、接触等拼接 |
| 动作维数 | 17 | 各关节力矩（连续） |
| 奖励 | 向前速度 + 存活 − 控制代价 | 鼓励平地向前走 |
| 终止 | 躯干过低 / 非法状态 | 跌倒 |

### 随机策略基线

```python
def run_humanoid_episode(seed=0, max_steps=1000):
    env = gym.make(ENV_ID)
    obs, info = env.reset(seed=seed)
    total = 0.0
    for _ in range(max_steps):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        total += reward
        if terminated or truncated:
            break
    env.close()
    return total

returns = [run_humanoid_episode(seed=i) for i in range(10)]
print("mean return:", sum(returns) / len(returns))
```

**预期**：随机力矩下人型很快跌倒，回报很低——说明行走需要**结构化策略**（课堂 PPO / 预训练策略）。

#rat2#
## 方案 B：MuJoCo Warp 并行（实验课核心）

将 LecExp01 的 CartPole 流程推广到人型：**同一模型，GPU 上跑 `nworld` 个并行环境**。

### 加载人型模型

```python
import mujoco
import numpy as np
import warp as wp
import mujoco_warp as mjwarp

wp.init()

# 方式 1：从 Gymnasium 导出 XML（与 Humanoid-v4 一致）
import gymnasium as gym
spec = gym.spec("Humanoid-v4")
entry = spec.kwargs.get("xml_file") or spec.kwargs.get("asset_path")
# 或方式 2：课程提供的 humanoid.xml 路径
# mjm = mujoco.MjModel.from_xml_path("path/to/humanoid.xml")

from gymnasium.envs.mujoco.mujoco_env import MujocoEnv
# 简便：直接用 gym 内部模型路径
env_tmp = gym.make("Humanoid-v4")
mjm = env_tmp.unwrapped.model
mjd = env_tmp.unwrapped.data
env_tmp.close()
```

### 创建并行数据

```python
NWORLD = 256   # 人型自由度多，nworld 可比 CartPole 小
m = mjwarp.put_model(mjm)
d = mjwarp.put_data(mjm, mjd, nworld=NWORLD)
```

### 随机初始姿态 + 控制

```python
# qpos: (nworld, nq)，人型 nq 远大于 CartPole
qpos_np = d.qpos.numpy().copy()
# 在默认站立姿态附近加小扰动（具体索引依模型而定，实验课 notebook 会标注）
qpos_np += np.random.uniform(-0.05, 0.05, size=qpos_np.shape).astype(np.float32)
d.qpos = wp.array(qpos_np, dtype=wp.float32)

# ctrl: (nworld, nu) 关节力矩
ctrl_np = np.random.uniform(-0.5, 0.5, size=(NWORLD, mjm.nu)).astype(np.float32)
d.ctrl = wp.array(ctrl_np, dtype=wp.float32)
```

### 推进仿真

```python
N_STEP = 500
root_z = []   # 记录躯干高度，观察是否跌倒

for t in range(N_STEP):
    mjwarp.step(m, d)
    if t % 50 == 0:
        wp.synchronize()
        qpos = d.qpos.numpy()
        # 通常 index 2 为根节点 z（依模型；以实验 notebook 为准）
        root_z.append(qpos[:, 2].copy())

wp.synchronize()
print("final root z mean:", d.qpos.numpy()[:, 2].mean())
```

| 操作 | CartPole (Exp01) | 人型 (Exp04) |
|------|------------------|--------------|
| `nq` | 2 | 数十 |
| `nu` | 1 | 17 左右 |
| 推荐 `nworld` | 1024+ | 128–512 |
| 关注量 | 杆角 `qpos[:,1]` | 根高度、前向 `x`、接触 |

#rat1#
## 行走任务与 RL 要点（对照 Lec04）

### 奖励设计（概念）

平地行走常用**加性奖励**：

\[
r_t = w_v \cdot v_x + w_h \cdot \mathbb{1}[\text{upright}] - w_c \|\mathbf{a}_t\|^2 - w_{\text{fall}}
\]

| 项 | 作用 |
|----|------|
| \(v_x\) | 鼓励向前 |
| 直立项 | 惩罚躯干过度倾斜 |
| 控制代价 | 力矩平滑、节能 |
| 跌倒惩罚 | 终止或大负奖励 |

### 与课堂方法对应

| Lec04 方法 | 本实验可观察的现象 |
|------------|-------------------|
| PPO + 并行采样 | `nworld` 越大，单位时间样本越多 |
| 域随机化 | 随机初始 `qpos`、摩擦即简化版 DR |
| 教师–学生 | 实验若提供预训练策略，对比随机 / 学生策略回报 |
| Sim2Real | 本实验仅在 Sim；真机需另做部署 |

#rat2#
## 实验记录清单

完成实验后建议记录：

| 项目 | 你的结果 |
|------|----------|
| GPU 型号 | |
| `nworld` | |
| steps/sec | |
| 随机策略平均回报 / 存活步数 | |
| 预训练策略（若有）平均回报 | |
| 跌倒时根节点高度阈值 | |

#rat1#
## 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `wp.init()` 失败 | 无 CUDA | 确认 NVIDIA 驱动与 CUDA |
| 吞吐量很低 | `nworld` 过大 / 未 warmup | 先 warmup 5 轮再计时 |
| 人型瞬间倒地 | 随机力矩过大 | 缩小 `ctrl` 范围 |
| `qpos` 索引不对 | 模型与 CartPole 不同 | 对照实验 notebook 或 `mjm.jnt_names` |

#rat2#
## 与 LecExp01 API 对照（复习）

| 操作 | CartPole | 人型 |
|------|----------|------|
| 创建并行 | `put_data(..., nworld=1024)` | 同左，`nworld` 适当减小 |
| 重置 | 改 `d.qpos`, `d.qvel` | 站立姿态 + 小噪声 |
| 控制 | `d.ctrl` 1 维力 | `d.ctrl` 17 维力矩 |
| 同步 | `wp.synchronize()` | 同左 |
| 评估 | 杆角是否发散 | 根高度、前向位移 |

**下一步**：在仿真中用 PPO 训练行走策略（Isaac Gym / 课程后续脚本），或加载教师策略观察稳定步态，再对照 Lec04 的 Sim2Real 管线。
