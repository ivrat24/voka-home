---
title: 短学期 Lec05
date: 2026-07-12
tags: [强化学习, DQN, 探索与利用, MCTS, 短学期]
description: 探索与利用、蒙特卡洛树搜索、深度 Q 网络（DQN）及 Double/Dueling/PER 等改进算法
---

#rat2#
## 回顾与定位

| 讲次 | 核心 | 本讲衔接 |
|------|------|----------|
| Lec02 | 表格 Q-Learning、TD 误差 | TD target \(r + \gamma \max_{a'} Q(s',a')\) |
| Lec03 | 神经网络函数逼近 \(Q(s,a;\mathbf{w})\) | 用网络替代 Q 表 |
| **Lec05** | **DQN + 探索 + MCTS** | 稳定训练 + Atari 像素输入 |

**本讲主线**：探索策略（MAB）→ 规划搜索（MCTS）→ 深度 Q 学习（经验回放 + 目标网络）→ 改进算法（DDQN / Dueling / PER）。

#rat2#
## 探索与利用

#### 困境

| 选择 | 含义 | 风险 |
|------|------|------|
| **利用** | 选当前统计最优动作 | 陷入局部最优 |
| **探索** | 尝试未充分评估的动作 | 短期回报下降 |

**原因**：环境不完全可观测；\(Q(s,a)\) 只能估计；未探索动作价值未知；已探索动作可能因随机性被高估/低估。

#### 问题难度谱

| 问题 | 特点 | 最优探索策略 |
|------|------|----------------|
| Multi-arm Bandit（MAB） | 无状态、单步 | 理论较成熟 |
| Contextual Bandit | 单步、有上下文 | 较难 |
| 小型有限 MDP | 有状态转移 | 更难 |
| 大型/连续 MDP | Atari、机器人 | **无通用最优解** |

#rat2#
## Multi-arm Bandit（MAB）

#### 伯努利 MAB 定义

- \(K\) 台机器，未知奖励概率 \(\{\theta_1,\ldots,\theta_K\}\)
- 每步选动作 \(a_t \in \{1,\ldots,K\}\)，观测 \(r_t \in \{0,1\}\)
- \(Q(a) = \mathbb{E}[r|a] = \theta_i\)（若 \(a\) 对应机器 \(i\)）
- **无状态** → 简化版 MDP

#### 目标与悔值

最大化累计回报 \(\sum_{t=1}^T r_t\)，等价于最小化**累积悔值**：

\[
\theta^* = \max_{a \in \mathcal{A}} Q(a), \quad
\mathcal{L}_T = \mathbb{E}\left[\sum_{t=1}^T (\theta^* - Q(a_t))\right]
\]

#### 动作价值估计

\[
\hat{Q}_t(a) = \frac{1}{N_t(a)} \sum_{\tau=1}^t r_\tau \,\mathbb{1}[a_\tau = a], \quad
N_t(a) = \sum_{\tau=1}^t \mathbb{1}[a_\tau = a]
\]

#rat2#
## 探索策略

#### ε-Greedy

以概率 \(1-\varepsilon\) 选 \(\arg\max_a \hat{Q}_t(a)\)，以 \(\varepsilon\) 随机探索。

| 设置 | 悔值增长 |
|------|----------|
| 固定 \(\varepsilon > 0\) | **线性** \(O(T)\) |
| \(\varepsilon\) 随 \(t\) 衰减 | **次线性** |

RL 中 DQN 行为策略常用 **\(\varepsilon\)-greedy** 收集数据。

#### UCB（Upper Confidence Bound）

\[
a_t = \arg\max_{a \in \mathcal{A}} \left( \hat{Q}_t(a) + U_t(a) \right)
\]

**Hoeffding 不等式**（\(X_1,\ldots,X_n \in [0,1]\) i.i.d.）：

\[
\mathbb{P}\left(\mathbb{E}[X] > \bar{X}_t + u\right) \le e^{-2tu^2}
\]

令 \(u = U_t(a)\)，要求 \(\mathbb{P}(Q(a) > \hat{Q}_t(a) + U_t(a)) \le p\)，取 \(p = t^{-4}\) 得：

\[
U_t(a) = \sqrt{\frac{2 \log t}{N_t(a)}}
\]

**UCB1 动作**：

\[
a_t^{\text{UCB}} = \arg\max_{a} \left( \hat{Q}_t(a) + c\sqrt{\frac{\log t}{N_t(a)}} \right)
\]

访问次数 \(N_t(a)\) 越大 → 置信上界越小 → 更信任经验均值。

#### 汤普森采样（Thompson Sampling）

1. 为每台机器维护奖励概率的**后验分布**
2. 每步从各动作后验**采样**一组 \(\tilde{\theta}_a\)
3. 选 \(\arg\max_a \tilde{\theta}_a\)

**伯努利 MAB + Beta 先验**：若动作 \(a\) 被拉 \(m_1\) 次得 1、\(m_2\) 次得 0，则

\[
\theta_a \sim \text{Beta}(m_1 + 1,\, m_2 + 1)
\]

蒙特卡洛方式实现「选最大奖励概率」的贝叶斯决策。

#### 深度 RL 中的探索（扩展阅读）

| 方向 | 代表工作 |
|------|----------|
| 好奇心 / 内在动机 | Schmidhuber 1991; RND 2018 |
| 计数式探索 | Bellemare et al. 2016 |
| Bootstrapped DQN | Osband et al. 2016 |

#rat2#
## 蒙特卡洛树搜索（MCTS）

#### 博弈树与 Minimax

双人零和博弈可建**博弈树**，Minimax：最大化己方得分、最小化对手得分。

**复杂度**：约 \(O(b^d)\)，\(b\) 为分支因子，\(d\) 为深度。

| 博弈 | 节点规模 |
|------|----------|
| 围棋 | \(\sim 10^{170}\) |
| 国际象棋 | \(> 10^{40}\) |

暴力搜索不可行 → **剪枝**（减小 \(b\)）+ **限深**（减小 \(d\)）+ **启发评估**。

#### MCTS 核心思想

**Monte Carlo Tree Search（2006 正式命名，思想可溯至 1987）**：

- 维护已探索状态树
- 记录每节点**平均奖励**与**访问次数**
- 从某状态**随机 rollout** 至终局，用胜负作价值信号
- **无需**手工设计启发函数（早期）

#### 四步迭代

```
1. Selection   — 从根沿 UCB 最大子节点递归下行
2. Expansion   — 为叶节点添加未访问子节点
3. Simulation  — 从新节点 rollout 至终局（任意策略）
4. Backprop    — 将结果沿路径回传，更新访问次数与均值
```

**UCT 选择公式**（子节点 \(i\)，父节点访问 \(N\) 次，子节点 \(n_i\) 次，累计奖励相关 \(r_t\)）：

\[
\text{UCB}_i = \frac{1}{n_i}\sum_{t=1}^{n_i} r_t + c\sqrt{\frac{\log N}{n_i}}
\]

| 优劣 | 说明 |
|------|------|
| 优势 | 无专家知识时有效；大量模拟后逼近真实价值；可并行 rollout |
| 劣势 | 方差大；rollout 策略影响效率 |

#### 与学习的结合（AlphaGo 路线）

| 组件 | 作用 |
|------|------|
| 价值网络 \(V(s)\) | 替代 rollout，评估叶节点 |
| 策略网络 \(\pi(a|s)\) | 引导 rollout / 扩展，偏向好棋 |
| 自对弈 + MCTS | Expert Iteration → **AlphaGo Zero / AlphaZero** |

**启发式搜索**（对比）：\(F(s) = G(s) + H(s)\)，\(G\) 为已走代价，\(H\) 为启发估计（需**可容许** \(H \le h^*\) 或**一致**）。

#rat2#
## 从 Q-Learning 到深度 Q 学习

#### 表格 Q-Learning（复习）

\[
Q(s,a) \leftarrow Q(s,a) + \alpha\left(r + \gamma \max_{a'} Q(s',a') - Q(s,a)\right)
\]

TD target：\(y = r + \gamma \max_{a'} Q(s',a')\)。

**局限**：连续或巨大状态空间无法建表 → 离散化需大量先验。

#### 深度 Q 网络

用神经网络 \(Q_\omega(s,a)\) 逼近 Q 函数。给定转移 \((s_i, a_i, r_i, s_i')\)：

\[
\omega^* = \arg\min_\omega \frac{1}{2N}\sum_{i=1}^N \left( Q_\omega(s_i,a_i) - y_i \right)^2
\]

\[
y_i = r_i + \gamma \max_{a'} Q_\omega(s_i', a')
\]

#### Fitted Q 迭代 vs 在线 Q 迭代

| 模式 | 流程 |
|------|------|
| **Fitted Q** | 收集数据集 → 批量算 \(y_i\) → 回归更新 \(\omega\) |
| **在线 Q** | 交互一步 → 算 \(y_i\) → 梯度更新 \(\omega\) |

**朴素深度 Q 的三问题**：

1. 转移数据**强相关**，不满足 i.i.d. 假设
2. TD target 用**同一网络** \(Q_\omega\) 计算，目标随 \(\omega\) 移动 → 非标准梯度下降
3. Q 值更新**不稳定**

#rat2#
## 经验回放（Experience Replay）

**Replay Buffer** \(\mathcal{B}\)：存储 \((s,a,r,s')\)，可来自任意历史策略。

```
交互 → 存入 ℬ → 从 ℬ 均匀采样 mini-batch → Fitted Q 更新
```

| 作用 | 说明 |
|------|------|
| 打破相关性 | 随机采样近似 i.i.d. |
| 提高样本效率 | 同一转移多次学习 |
| 稳定训练 | 批量回归 |

**并行 Q-learning**：多进程收集数据、异步/同步更新 \(\omega\)（A3C 等前身思想）。

#rat2#
## 目标网络（Target Network）

#### 移动目标问题

同一输入 \((s,a)\) 在短时间内 TD target 不断变化（类比分类标签从 dog→cat→dog 漂移）。

#### 解法

维护**目标网络** \(Q_{\omega^-}\)，TD target 用 \(\omega^-\) 计算且**不回传梯度**：

\[
y_i = r_i + \gamma \max_{a'} Q_{\omega^-}(s_i', a')
\]

**更新方式**：

| 方式 | 公式 |
|------|------|
| 硬更新 | 每 \(N\) 步 \(\omega^- \leftarrow \omega\) |
| 软更新 | \(\omega^- \leftarrow \tau \omega^- + (1-\tau)\omega\)，如 \(\tau=0.99\) |

#rat2#
## 经典 DQN 算法

**Mnih et al., 2013 — Playing Atari with Deep Reinforcement Learning**

```
初始化 Q 网络 Q_ω、目标网络 Q_{ω^-}（ω^- ← ω）、空 replay buffer ℬ

循环：
  1. ε-greedy 选动作 a，观测 (s,a,r,s')，存入 ℬ
  2. 从 ℬ 均匀采样 mini-batch {s_j,a_j,r_j,s'_j}
  3. y_j ← r_j + γ max_{a'} Q_{ω^-}(s'_j, a')
  4. 最小化 (Q_ω(s_j,a_j) - y_j)²，更新 ω
  5. 每 C 步：ω^- ← ω（或软更新）
```

**三过程**：

| 过程 | 内容 |
|------|------|
| 数据收集 | \(\pi(a|s)\) ε-greedy → \((s,a,r,s')\) → ℬ |
| Q 值迭代 | 采样 batch → TD target → MSE 损失 |
| 参数更新 | 更新 \(\omega\)；周期性同步 \(\omega^-\) |

**Atari 实现要点**（与 Lec03 CNN 衔接）：

- 输入：最近 4 帧灰度图堆叠
- 网络：CNN 特征 + 全连接输出 \(|A|\) 个 Q 值
- 奖励裁剪、帧跳过等工程技巧

#rat2#
## DQN 改进算法

#### Q 值过高估计

**自举（Bootstrapping）** 共性：\(\max\) 操作倾向于选中被噪声**高估**的动作。

\[
\mathbb{E}\left[\max(Q(s,a_1)+X_1,\, Q(s,a_2)+X_2)\right] \ge \max(\mathbb{E}[Q(s,a_1)+X_1],\, \mathbb{E}[Q(s,a_2)+X_2])
\]

Atari 上 DQN 预测 Q 常**高于**真实累计回报。

#### Double DQN（DDQN）

**解耦「选动作」与「估价值」**：

| 算法 | TD target |
|------|-----------|
| DQN | \(y = r + \gamma Q_{\omega^-}(s', \arg\max_{a'} Q_{\omega^-}(s',a'))\) |
| **DDQN** | \(y = r + \gamma Q_{\omega^-}(s', \arg\max_{a'} Q_{\omega}(s',a'))\) |

用**在线网络** \(Q_\omega\) 选 \(a'\)，用**目标网络** \(Q_{\omega^-}\) 评估——若两网络误差不完全相关，可缓解过估计。

#### Dueling DQN

分解 \(Q(s,a) = V(s) + A(s,a)\)：

| 网络 | 输出 | 含义 |
|------|------|------|
| \(V_\omega(s)\) | 标量 | 状态整体好坏 |
| \(A_\theta(s,a)\) | \(|A|\) 维 | 动作相对平均的优势 |

\[
Q_{\omega,\theta}(s,a) = V_\omega(s) + A_\theta(s,a) - \frac{1}{|\mathcal{A}|}\sum_{a'} A_\theta(s,a')
\]

（实践中用**均值**而非 max 归一化优势，使收敛时 \(\max_{a'} A \to 0\)。）

**直觉**（Atari 驾车）：前方无车时各动作优势应相近（\(V\) 主导）；有车时转向/刹车优势分化（\(A\) 主导）→ **样本利用更高效**。

#### 优先经验回放（PER）

TD 误差大的转移「更值得学」：

\[
p_t \propto |\delta_t| + \epsilon \quad \text{或} \quad p_t \propto \frac{1}{\text{rank}(t)}
\]

**重要性采样修正**学习率，避免偏置：

\[
\alpha_t \leftarrow \alpha \cdot (n \cdot p_t)^{-\beta}, \quad \beta \in [0,1]
\]

均匀采样时 \(p_t = 1/n \Rightarrow \alpha_t = \alpha\)，退化为普通 replay。

#### 其他改进（了解）

| 方法 | 要点 |
|------|------|
| n-step TD | MC 与 TD 折中 |
| Noisy Net | 参数化探索，替代 ε-greedy |
| C51 / QR-DQN | 分布 Q 学习 |
| **Rainbow** | 上述多种组合 |

#rat2#
## 方法对比速查

| 算法 | 核心改动 | 解决什么问题 |
|------|----------|--------------|
| DQN | Replay + Target Net | 不稳定、数据相关 |
| Double DQN | 在线选动作、目标估 Q | Q 过估计 |
| Dueling DQN | \(V + A\) 结构 | 状态价值与动作优势解耦 |
| PER | 按 TD 误差采样 | 样本效率 |
| MCTS + NN | 规划 + 学习 | 大动作空间决策 |

#rat2#
## 下午实验与作业

**必做**（详见 [LecExp05](短学期_LecExp05.html)）：

1. 手写经典 **DQN** 算法
2. 在 Atari **Freeway** 环境测试
3. 尝试其他 Atari 环境

**作业**：实现 **Double DQN（DDQN）**

**可选**：实现 **Dueling DQN**

#rat2#
## 小结与衔接

| 模块 | 要点 |
|------|------|
| 探索 | ε-greedy、UCB、Thompson；MAB 悔值 |
| MCTS | Select–Expand–Simulate–Backprop；UCT；AlphaZero |
| DQN | \(Q_\omega\) + Replay + Target Net |
| 改进 | DDQN 解耦 max；Dueling 分解 Q；PER 优先采样 |

**向上衔接**：Lec02 Q-Learning → Lec03 网络逼近 → **Lec05 稳定深度 Q**

**向下衔接**：Rainbow / 离线 RL / 连续控制（DDPG、SAC）/ 多智能体（课程名 MARL）

**一句话**：DQN = **Q-Learning + 深度学习 + 经验回放 + 目标网络**；探索与 MCTS 解决「往哪走」与「搜多深」，DDQN 等解决「Q 估准」。
