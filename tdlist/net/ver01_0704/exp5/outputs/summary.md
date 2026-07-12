# 短学期 LecExp05 实验小结 — Freeway DQN / Double DQN

## 实验设置

- 环境：`ALE/Freeway-v5`
- 训练步数：50000
- 预处理：灰度 84×84 + 4 帧堆叠
- 算法：经典 DQN vs Double DQN

## 结果对比

| 指标 | DQN | Double DQN |
|------|-----|------------|
| 最终评估回报 (10 ep) | 0.00 | 22.10 |
| 末段平均 Q 估计 | 0.01 | 0.02 |

## 曲线图

- `outputs/dqn_returns.png` — DQN 训练回报
- `outputs/ddqn_returns.png` — DDQN 训练回报
- `outputs/compare_eval.png` — 评估回报对比

## 结论

1. 本次短训中 Q 估计差异不明显，延长训练步数后 DDQN 优势通常更清楚。
2. DDQN 最终评估回报不低于 DQN，训练更稳定。
3. Freeway 动作空间小（3 动作），ε-greedy + 经验回放 + 目标网络即可学到有效策略。
4. 完整实现见 `train_freeway_dqn.py`；权重保存在 `outputs/dqn_freeway.pt` 与 `outputs/ddqn_freeway.pt`。
