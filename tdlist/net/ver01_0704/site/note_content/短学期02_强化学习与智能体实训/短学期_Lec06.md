---
title: 短学期 Lec06
date: 2026-07-15
tags: [强化学习, 策略梯度, REINFORCE, Actor-Critic, A2C, 短学期]
description: 策略梯度、REINFORCE、Advantage Actor-Critic 与 A2C/A3C 要点
---

#rat2#
## 回顾与定位

| 讲次 | 核心 | 本讲衔接 |
|------|------|----------|
| Lec02 | 表格 TD / Q-Learning | 值函数估计 |
| Lec05 | DQN（值函数逼近） | 由价值导出策略 |
| **Lec06** | **策略梯度 / Actor-Critic** | 直接参数化 \(\pi_\theta\) |

**本讲主线**：参数化策略 → 策略梯度定理与 REINFORCE → 基线与 Advantage → Actor-Critic → A2C / A3C。

#rat1#
## 为什么要策略梯度

基于价值的方法（Q-Learning / DQN）先学 \(Q\)，再贪心取动作。局限：

| 问题 | 表现 |
|------|------|
| 连续动作 | \(\arg\max_a Q(s,a)\) 困难 |
| 随机最优策略 | 贪心难以自然表达 |
| 非平稳 | 策略随 \(Q\) 间接改变 |

**策略方法**：直接优化 \(\pi_\theta(a\mid s)\)，优点：收敛性质较好、擅长连续/随机策略；缺点：易局部最优、评估方差大。

#rat2#
## 目标函数

参数化策略后，用标量目标衡量 \(\pi_\theta\) 的好坏，常见三种等价形式：

1. **平均价值**：\(J(\theta)=\mathbb{E}_{s\sim d}[v_{\pi_\theta}(s)]\)
2. **平均奖励**：\(J(\theta)=\sum_s d(s)\sum_a \pi_\theta(a\mid s)\,r(s,a)\)
3. **轨迹回报**：\(J(\theta)=\mathbb{E}_{\tau\sim p_\theta}[R(\tau)]\)，其中 \(R(\tau)=\sum_t r(s_t,a_t)\)

策略越好，这些目标越大。优化：

\[
\theta_{t+1} \leftarrow \theta_t + \alpha\,\nabla_\theta J(\theta_t)
\]

#rat1#
## 策略梯度定理与 REINFORCE

轨迹似然：

\[
p_\theta(\tau)=p(s_1)\prod_t \pi_\theta(a_t\mid s_t)\,p(s_{t+1}\mid s_t,a_t)
\]

**似然比技巧**给出经典形式：

\[
\nabla_\theta J(\theta)
=\mathbb{E}_{\tau\sim p_\theta}\Big[
\sum_t \nabla_\theta\log\pi_\theta(a_t\mid s_t)\,G_t
\Big],
\quad
G_t=\sum_{k=0}^{T-t-1}\gamma^k r_{t+k+1}.
\]

**REINFORCE**：用当前策略采样轨迹 → 计算 \(G_t\) → 上升 \(\log\pi\) 加权梯度。

| 特点 | 说明 |
|------|------|
| 同策略 | 数据必须由 \(\pi_\theta\) 产生 |
| 无偏 | 期望正确，但单条轨迹方差大 |
| 步长敏感 | 过大更新 → 坏策略 → 恶性循环 |

#rat2#
## 降低方差：\(Q\)、基线与 Advantage

用动作价值代替完整回报：

\[
\nabla_\theta J
\approx\mathbb{E}\big[
\nabla_\theta\log\pi_\theta(a_t\mid s_t)\,\hat Q^\pi(s_t,a_t)
\big]
\]

再减去状态基线（不改变期望，可降方差）：

\[
\hat A^\pi(s_t,a_t)=\hat Q^\pi(s_t,a_t)-\hat V^\pi(s_t)
\]

这就是 **Advantage**：动作比「平均预期」好多少。\(A>0\) 提高概率，\(A<0\) 降低概率。

一步形式（A2C 常用）：

\[
\hat A_t = r_t + \gamma V(s_{t+1}) - V(s_t)
\]

#rat1#
## Actor-Critic

| 角色 | 网络 | 作用 |
|------|------|------|
| **Actor** | \(\pi_\theta\) | 按优势改进策略 |
| **Critic** | \(V_\phi\) 或 \(Q_\phi\) | 估计回报 / 优势 |

两种结构：

1. **双网络**：策略与价值各自独立，更稳但参数更多  
2. **共享编码器**：\(s\to z\)，再分支 policy / value 头（本实验采用）

联合损失（与实验课一致）：

\[
\mathcal{L}
=\underbrace{-\mathbb{E}[\log\pi_\theta(a_t\mid s_t)\,\mathrm{stopgrad}(A_t)]}_{\mathcal{L}_\pi}
+c_v\,\underbrace{\mathbb{E}[(V_\phi(s_t)-G_t)^2]}_{\mathcal{L}_V}
-c_e\,\mathbb{E}[\mathcal{H}(\pi_\theta(\cdot\mid s_t))]
\]

- `stopgrad(A)`：防止策略损失经 \(A\) 反向误更新 Critic  
- 熵项：防止过早确定性塌缩，维持探索  

#rat2#
## A2C / A3C 与同离策略要点

| 算法 | 要点 |
|------|------|
| **A2C** | 同步多环境采集，用 \(A=r+\gamma V(s')-V(s)\) 更新 |
| **A3C** | 异步多 worker，提高吞吐 |
| 改进批量 | Critic 用当前策略重采样动作，缓解离策略偏差 |
| 自然策略梯度 | 用 KL / Fisher 约束策略更新步长（TRPO 前身思想） |

#rat1#
## 与 DQN（Lec05）对照

| 维度 | DQN | Actor-Critic |
|------|-----|--------------|
| 优化对象 | \(Q_\omega(s,a)\) | \(\pi_\theta,\ V_\phi\) |
| 探索 | \(\varepsilon\)-greedy | 策略分布 + 熵正则 |
| 动作 | 离散贪心 | 采样 / 连续高斯均可 |
| 更新数据 | 离策略 replay | 同策略轨迹（经典 AC） |
| 方差 | 目标网络+replay 稳住 | Advantage / GAE 降低 |

**一句话**：值方法学「状态-动作有多好」；策略梯度直接学「该怎么做」；Actor-Critic 用 Critic 给 Actor 当低方差的打分器。

#rat2#
## 衔接实验

实践见 [LecExp06](短学期_LecExp06.html)：Monte Carlo AC（\(A_t=G_t-V(s_t)\)）于 CartPole + Atari Freeway / Pong。
