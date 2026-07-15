# 短学期 LecExp05 实验小结 — Freeway DQN / Double DQN

## 实验设置

| 项目 | 取值 |
|------|------|
| 环境 | `ALE/Freeway-v5` |
| 训练步数 | **50,000**（DQN / DDQN 各一轮） |
| 预处理 | AtariPreprocessing 84×84 灰度 + 4 帧堆叠 → `(4,84,84)` |
| batch / replay | 32 / 50k，`learn_start=5k`，`target_sync=1k` |
| ε | 1.0 → 0.05，60k 步线性衰减 |
| 优化器 | Adam `1e-4`，Huber loss |
| seed | 42 |

## 结果对比（与 `*_metrics.json` 一致）

| 指标 | DQN | Double DQN |
|------|-----|------------|
| 最终评估回报（10 ep 贪心） | 0.00 | **22.10** |
| 训练中最佳 eval | 12.6 @ 20k | **22.4** @ 20k–50k |
| eval 轨迹 | 0 → 12.6 → 7.4 → 0 → 0 | 19.8 → 22.4 → 22.4 → 22.4 → 22.4 |
| 末段平均 Q 估计 | 0.013 | 0.017 |
| 训练回合最高回报 | 0 | **19** |

## 曲线图

- `dqn_returns.png` / `ddqn_returns.png` — 训练回报
- `dqn_eval.png` / `ddqn_eval.png` — 各自评估曲线
- `compare_eval.png` — DQN vs DDQN 评估对比

## 结论

1. **DDQN 明显更稳**：10k 步起 eval 已达 19.8，之后稳定在约 22.4；最终贪心评估 **22.1**。
2. **DQN 中期有波峰但未稳住**：20k 步 eval 达 12.6，后期回落到 0，说明短训 + 高探索衰减下经典 DQN 策略更易塌缩。
3. Freeway 动作空间小（3），经验回放 + 目标网络足以学到过马路；**Double DQN 的在线选动作、目标估 Q** 在本实验中更可靠。
4. 复现代码：`exp5/train_freeway_dqn.py`；权重：`dqn_freeway.pt` / `ddqn_freeway.pt`。
