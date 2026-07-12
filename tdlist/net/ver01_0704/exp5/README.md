# LecExp05 — Freeway DQN / Double DQN

## 快速运行

```bash
pip install gymnasium[atari] ale-py torch matplotlib
python train_freeway_dqn.py
```

## 输出 (`outputs/`)

| 文件 | 内容 |
|------|------|
| `dqn_returns.png` / `ddqn_returns.png` | 训练回报曲线 |
| `compare_eval.png` | DQN vs DDQN 评估对比 |
| `summary.md` | 实验小结 |
| `dqn_freeway.pt` / `ddqn_freeway.pt` | PyTorch 权重 |
| `*_metrics.json` | 数值指标 |

## 本地笔记

- [LecExp05 网页](../site/pages/notes/短学期02_强化学习与智能体实训/短学期_LecExp05.html)
- [Lec05 理论](../site/pages/notes/短学期02_强化学习与智能体实训/短学期_Lec05.html)
