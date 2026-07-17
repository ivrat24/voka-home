---
title: 短学期 Lec07
date: 2026-07-17
tags: [强化学习, DDPG, TRPO, PPO, SAC, 策略优化, 短学期]
description: 确定性策略梯度与 DDPG、TRPO 可信域、PPO 裁剪目标与 SAC 最大熵方法
---

#rat2#
## 回顾与定位

| 讲次 | 核心 | 本讲衔接 |
|------|------|----------|
| Lec05 | DQN（值方法） | 由 \(Q\) 导出策略 |
| Lec06 | 策略梯度 / Actor-Critic | 直接优化 \(\pi_\theta\)，步长与方差问题 |
| **Lec07** | **策略优化（Policy Optimization）** | 约束更新幅度 + 确定性 / 最大熵变体 |

**本讲主线**：确定性策略（DPG / DDPG）→ 随机策略步长失控 → TRPO（KL 可信域）→ PPO（裁剪 ratio）→ SAC（熵正则）。

#rat1#
## 课程回顾：Actor-Critic 与策略类型

Lec06 的 Actor-Critic：

| 角色 | 符号 | 作用 |
|------|------|------|
| Actor | \(\pi_\theta(a\mid s)\) | 采取让 Critic「满意」的动作 |
| Critic | \(Q_\phi(s,a)\) 或 \(V_\phi(s)\) | 估计当前策略下的动作 / 状态价值 |

策略按是否随机、动作是否连续可分：

| 类型 | 离散动作 | 连续动作 |
|------|----------|----------|
| **随机策略** | Softmax / Categorical | 高斯等参数化分布 |
| **确定性策略** | \(\arg\max\)（对网络参数通常**不可微**） | \(\mu_\theta(s)\)（**可微**，可链式回传） |

本讲重点：连续控制上的确定性方法，以及随机策略的「可信更新」。

#rat2#
## 确定性策略方法：DPG → DDPG

### 确定性策略梯度（DPG）

确定性策略 \(a=\mu_\theta(s)\)。Critic 估计 \(Q(s,a)\)，梯度可经动作回传到 Actor（链式法则）：

\[
\nabla_\theta J(\theta)
\approx \mathbb{E}_{s\sim d^{\mu}}\Big[
\nabla_a Q(s,a)\big|_{a=\mu_\theta(s)}\;
\nabla_\theta \mu_\theta(s)
\Big]
\]

相对随机策略梯度，少了对 \(\log\pi\) 的采样噪声；但早期深度 Actor-Critic 在困难环境上仍不稳定。

### DDPG：把 DQN 的稳定技巧搬到 DPG

**Deep Deterministic Policy Gradient** 在 DPG 上叠加：

| 技巧 | 作用 |
|------|------|
| **经验回放** | 离策略复用转移，打断时间相关 |
| **目标网络** | 稳住 TD 目标 |
| **Q 网络批标准化** | 稳定不同量纲的状态 / 动作输入 |
| **动作噪声** | 在 \(\mu_\theta(s)\) 上加噪声做探索（如 OU / 高斯） |

**一句话**：DDPG = 确定性 Actor + Critic，用 replay + target 学连续控制。

#rat1#
## 随机策略的痛点

REINFORCE / 朴素策略梯度：

1. **步长难定**：一步更新过大 → 策略变差 → 后续轨迹质量崩坏（「一步踩空掉下山」）。
2. **分布漂移**：多步更新后，用于估梯度的轨迹来自旧策略 \(\pi_{\theta_{\mathrm{old}}}\)，与当前 \(\pi_\theta\) 差越来越大（离策略偏差）。

因此需要显式约束「新旧策略别差太远」——这就是 TRPO / PPO 的动机。

#rat2#
## TRPO：信任域策略优化

### 目标与重要性采样

策略优化可用优势加权的代理目标。用旧策略采样、对新策略评估时引入重要性采样：

\[
r_t(\theta)=\frac{\pi_\theta(a_t\mid s_t)}{\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)}
\]

代理目标形如 \(\mathbb{E}\big[r_t(\theta)\,\hat A_t\big]\)（具体形式与状态分布近似有关）。

### 约束优化形式

TRPO 把「稳步提升」写成**带 KL 约束**的问题（示意）：

\[
\max_\theta\;
\mathcal{L}(\theta_{\mathrm{old}},\theta)
\quad
\text{s.t.}\quad
\mathbb{E}_{s\sim \pi_{\theta_{\mathrm{old}}}}
\big[
D_{\mathrm{KL}}\big(\pi_{\theta_{\mathrm{old}}}(\cdot\mid s)\,\|\,\pi_\theta(\cdot\mid s)\big)
\big]
\le \delta
\]

直观：**在可信域内**最大化代理优势，避免策略突变。

### 实际求解（近似）

原问题难算，常用近似：

1. 对 \(\mathcal{L}\) 与平均 KL 在 \(\theta_{\mathrm{old}}\) 附近 **Taylor 展开**  
   - 线性化目标 \(\approx g^\top(\theta-\theta_{\mathrm{old}})\)  
   - 二次化约束 \(\approx \tfrac12(\theta-\theta_{\mathrm{old}})^\top H(\theta-\theta_{\mathrm{old}})\le\epsilon\)（\(H\) 与 Fisher / KL Hessian 相关）
2. 对偶给出解析方向后，用 **线搜索（backtracking）** 保证 KL 约束与优势提升 \(>0\)

| 概念 | 含义 |
|------|------|
| **自然策略梯度（NPG）** | 用 Fisher 度量归一梯度，是 TRPO 的思想近亲 |
| **单调性** | 在近似成立时，更新有性能不降的理论保证（实践中仍依赖近似质量） |

**代价**：共轭梯度 + 线搜索，实现重、算力高 → 催生 PPO。

#rat1#
## PPO：近端策略优化

OpenAI（2017）提出，在**易实现、样本效率、调参难度**之间折中，成为深度 RL 最常用基线之一。

### 相对 TRPO 的不足与改进

| TRPO 痛点 | PPO 做法 |
|-----------|----------|
| 重要性比例方差大 | 对 ratio **裁剪（clip）** |
| 约束优化难解 | 一阶梯度 + 简单目标，无需二阶 / CG |
| — | 常用多步 TD / GAE 估优势 |

### 裁剪目标（Clipped Surrogate）

\[
r_t(\theta)=\frac{\pi_\theta(a_t\mid s_t)}{\pi_{\theta_{\mathrm{old}}}(a_t\mid s_t)},
\quad
L^{\mathrm{CLIP}}(\theta)
=\mathbb{E}_t\Big[
\min\big(
r_t(\theta)\hat A_t,\;
\mathrm{clip}\big(r_t(\theta),\,1-\epsilon,\,1+\epsilon\big)\hat A_t
\big)
\Big]
\]

解读（\(\epsilon\) 常见 \(0.1\sim 0.2\)）：

| 情形 | 行为 |
|------|------|
| \(r_t\in[1-\epsilon,1+\epsilon]\) | 正常更新：\(A>0\) 提高概率，\(A<0\) 降低概率 |
| \(r_t>1+\epsilon\) 且 \(A>0\) | 已过度抬高该动作 → **梯度截断**，不再继续推大 |
| \(r_t<1-\epsilon\) 且 \(A<0\) | 已过度压低 → 截断，避免继续压 |

本质：用 importance ratio 的范围限制「每轮策略能改多大」。

### 另一种形式：自适应 KL 惩罚

\[
L = \mathbb{E}[r_t\hat A_t] - \beta\, D_{\mathrm{KL}}(\pi_{\mathrm{old}}\|\pi_\theta)
\]

按实测 KL 相对目标 \(d_{\mathrm{targ}}\) 动态调 \(\beta\)（过大则增大惩罚，过小则减小）。

### 训练循环（示意）

1. 并行 \(N\) 个 Actor 用 \(\pi_{\theta_{\mathrm{old}}}\) 采 \(T\) 步  
2. 算 \(\hat A_t\)（多步 TD / GAE）与裁剪损失  
3. 多 epoch mini-batch 更新 \(\theta\)，再令 \(\theta_{\mathrm{old}}\leftarrow\theta\)

### 分布式：DPPO

| 角色 | 职责 |
|------|------|
| **Worker** | 并行采轨迹 / 算梯度 |
| **Chief** | 聚合（平均）梯度，更新全局策略再下发 |

可并行点：不同轨迹采集相互独立；满足条件后可不阻塞全部轨迹再更新。

**一句话**：PPO ≈「用 clip 的 ratio 代替 TRPO 的硬 KL 约束」——稳、快、好实现。

#rat2#
## SAC：Soft Actor-Critic

面向**连续动作**的最大熵 Actor-Critic：在回报之外鼓励策略保持随机性。

### 动机

| 目标 | 手段 |
|------|------|
| 保持策略多样性、更好探索 | **熵正则** \(\alpha\,\mathcal{H}(\pi(\cdot\mid s))\) |
| 提高样本效率与稳定 | **经验回放** + soft Q / soft 更新 |

熵直觉：公平硬币熵最大（最不可预测）；两面相同则熵为 0（完全可预测）。

\[
H(X)=-\sum_i P(x_i)\log P(x_i)
\]

### Soft 目标（概念）

最大化期望回报 + 熵：

\[
J(\pi)=\mathbb{E}\Big[
\sum_t r(s_t,a_t)+\alpha\,\mathcal{H}\big(\pi(\cdot\mid s_t)\big)
\Big]
\]

Critic 侧 soft Bellman（示意）：下一状态价值含 \(-\alpha\log\pi(a'\mid s')\)，避免只盯单个 \(\max_a Q\)。

### 更新模块（与课件一致的拆分）

| 网络 | 更新要点 |
|------|----------|
| **\(V(s)\)** | 目标 \(y=Q(s,a)-\alpha\log\pi(a\mid s)\)，MSE 拟合 |
| **\(\pi\)** | 最大化 \(\mathbb{E}[Q(s,a)-\alpha\log\pi(a\mid s)]\)（等价最小化 \(\alpha\log\pi-Q\)） |
| **\(Q(s,a)\)** | \(Q_{\mathrm{target}}=r+\gamma V'(s')\)，MSE 拟合 |
| **目标网** | 软更新 \(V'\leftarrow\tau V+(1-\tau)V'\)（\(Q'\) 同理） |

优点简述：soft Q 更鲁棒；熵项提升探索；适合机器人控制等连续任务。

#rat1#
## 方法对照与总结

| 方法 | 策略类型 | 核心稳定手段 | 典型场景 |
|------|----------|--------------|----------|
| **DDPG** | 确定性 \(\mu_\theta\) | Replay + 目标网 + 动作噪声 | 连续控制 |
| **TRPO** | 随机 | KL **硬约束** + 二阶近似 / 线搜索 | 理论保证强，实现重 |
| **PPO** | 随机 | **Clip ratio**（或 KL 惩罚） | 通用强基线 |
| **SAC** | 随机（最大熵） | 熵温度 \(\alpha\) + soft Q + replay | 连续控制、探索敏感任务 |

总结口径（课件）：

1. 连续确定性策略：Critic 对动作求导，再链式传到 Actor。  
2. 神经网络策略步长过大 → 策略变差 → 数据质量塌陷。  
3. **TRPO** 用 KL 限制一步更新，稳步抬升。  
4. **PPO** 限制 importance ratio 范围，构造稳定可优化的下界目标——当前最常用的深度策略梯度算法之一。

### 推荐阅读

- *Trust Region Policy Optimization*（Schulman et al.）  
- *Proximal Policy Optimization Algorithms*（Schulman et al.）

#rat2#
## 衔接实验

课件标注下午实验：**人型机器人复杂地形行走**（在 LecExp04 平地行走基础上提高场景难度）。理论侧本讲以 DDPG / TRPO / PPO / SAC 为主线；实现细节以课程实验手册为准。
