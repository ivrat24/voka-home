# LecExp06 — Actor-Critic

## 快速运行

```bash
pip install gymnasium[atari] ale-py torch matplotlib
python train_actor_critic.py --suite all
# 或分别: --suite cartpole / freeway / pong
```

## 输出 (`outputs/`)

| 文件 | 内容 |
|------|------|
| `cartpole_returns.png` 等 | 训练曲线 |
| `*_actions.png` | 动作分布 |
| `*_metrics.json` | 数值指标 |
| `summary.md` | 实验小结 |

## 课程资料

- 讲义 PDF：`6 Policy Gradient.pdf`
- Notebook：`site/note_content/.../materials/exp6_ac.ipynb`
- 笔记：Lec06 / LecExp06
