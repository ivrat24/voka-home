---
title: 短学期 LecExp07
date: 2026-07-17
tags: [具身智能, AMP, PPO, Unitree G1, 粗糙地形, 短学期, 实验]
description: G1 粗糙地形行走实验报告——AMP 状态/LSGAN/风格奖励与任务奖励公式实现；GPU 全量训练待补
---

#rat1#
## 实验目标

在 **Unitree G1 + 粗糙地形** 上训练带 **AMP（Adversarial Motion Priors）** 风格先验的速度跟踪策略，并可选比较 **height scan** 与 **depth** 观测。

| 项 | 内容 |
|----|------|
| 平台 | `mjlab==1.5.0` + MuJoCo Warp，Conda 环境 `summer` |
| 算法 | RSL-RL **PPO** 扩展为 **AmpPPO**（每轮 PPO 更新外再更新判别器） |
| 动作 | 原生 **29 维** `joint_pos` |
| 学生文件 | 只改 `student.py`；提交 `policy.pt` + `model.py` + `student.py` |

**前置**：[Lec07](短学期_Lec07.html)（PPO / 策略优化）、[LecExp04](短学期_LecExp04.html)（平地行走基础）。

**评分（满分 100）**：

| 分项 | 分值 | 对应实现 |
|------|------|----------|
| 提交与有限动作 | 20 | 导出策略、29 维动作契约 |
| 速度跟踪 | 20 | `rough_task_reward` |
| 6 m 穿越 | 20 | held-out 前向穿越评测 |
| AMP | 10 | `build_amp_state` + `style_reward` + 判别器 |
| depth（可选） | 10 | `normalize_depth` |
| 平滑度 | 20 | `smoothness_penalty` |

#rat2#
## 当前进度（本机无 GPU）

本机 **无可用 CUDA**，无法完成 smoke / 4096-env 训练 / 评测与视频。已完成部分：

| 阶段 | 状态 |
|------|------|
| `student.py` 六个公式 | **已完成**，单元测试全部通过 |
| 环境 smoke（32 env） | 待 GPU |
| AmpPPO 训练（height，默认 4096 env × 600 iter） | 待 GPU |
| Held-out 评测 / 录屏 / 提交包 | 待 GPU |

有 GPU 时一键流水线（实验包内）：

```bat
一键运行_GPU.bat
REM 或 cd exp07_rough_walk && run_all.bat
```

等价：`python run_all.py --mode height --device cuda:0`。

材料副本：`materials/exp7_student.py`、`materials/exp7_rough_walk.ipynb`。

#rat1#
## 环境与观测设计

| 设定 | 取值 |
|------|------|
| 并行环境（训练 height） | 4096 |
| Episode 长度 | 12 s |
| `auto_reset` | `False`（手动 reset，配合 AMP wrapper） |
| Actor 观测 | proprioception + command + **height** 或 **depth** |
| Critic 观测 | 保留 privileged（非对称 Actor-Critic） |
| AMP 观测 | 独立组 `amp`，**83 维**状态（不进 Actor 主输入） |

**命令课程**（逐步加大速度 / 转向）：

| 阶段（约） | \(v_x\) | \(v_y\) | \(\omega_z\) |
|------------|--------|--------|--------------|
| step 0 | [0, 0.5] | ±0.1 | ±0.2 |
| step 4800 | [0.1, 0.8] | ±0.2 | ±0.35 |
| step 9600 | [0.15, 1.1] | ±0.3 | ±0.5 |

Held-out **6 m 穿越**：固定 \(v_x=0.6\)，关闭横向 / 转向命令重采样。

#rat2#
## 学生公式（已实现）

### 1. AMP 状态（83 维）

按固定顺序拼接：

\[
s=\big[
q_{29},\;\dot q_{29},\;h_{\mathrm{pelvis}},\;g_{\mathrm{proj},3},\;
v_{\mathrm{yaw},3},\;\omega_{\mathrm{yaw},3},\;
p_{\mathrm{key}}^{(5\times3)}
\big]\in\mathbb{R}^{83}
\]

五个 key body：左右腕 yaw、左右踝 roll、躯干（相对 pelvis、yaw 局部坐标）。

相邻状态拼成判别器输入 \(s_t\oplus s_{t+1}\in\mathbb{R}^{166}\)。

```python
key_body_flat = key_body_pos_pelvis.reshape(*key_body_pos_pelvis.shape[:-2], -1)
return torch.cat(
  (joint_pos, joint_vel, pelvis_height, projected_gravity,
   base_lin_vel_yaw, base_ang_vel_yaw, key_body_flat),
  dim=-1,
)
```

### 2. LSGAN 判别器损失

专家目标 \(+1\)、策略目标 \(-1\)，梯度惩罚权重 10：

\[
L_D=\tfrac12\Big[
\mathbb{E}(D_E-1)^2+\mathbb{E}(D_\pi+1)^2
\Big]+10\,L_{\mathrm{gp}}
\]

### 3. 风格奖励

\[
r_{\mathrm{style}}=\mathrm{clamp}\big(1-0.25(D-1)^2,\;0,\;1\big)
\]

注入环境奖励：\(r\leftarrow r+\alpha_{\mathrm{amp}}\,\Delta t\,r_{\mathrm{style}}\)（默认 \(\alpha_{\mathrm{amp}}=0.5\)，\(\Delta t=0.02\)）。

### 4. Depth 归一化（可选 10 分）

裁剪到 \([0.1,5.0]\) m 后线性映射到 \([0,1]\)，形状 `[B,1,60,80]`。

### 5. 粗糙地形任务奖励

\[
r_{\mathrm{lin}}=\exp\big(-(e_{\mathrm{lin}}/0.45)^2\big),\quad
r_{\mathrm{ang}}=\exp\big(-(e_{\mathrm{ang}}/0.35)^2\big)
\]

\[
r_{\mathrm{task}}=0.6\,r_{\mathrm{lin}}+0.4\,r_{\mathrm{ang}}
\]

零误差时 \(r_{\mathrm{task}}=1\)；配置里该项权重约 `3.8`。

### 6. 动作平滑惩罚

二阶差分（鼓励加速度平滑）：

\[
p_t=\mathrm{mean}\big(|a_t-2a_{t-1}+a_{t-2}|\big)
\]

奖励权重约 `-0.05`（惩罚项）。

#rat1#
## AmpPPO 训练要点

标准 PPO 之上仅扩展：

1. **Act**：缓存当前 83 维 AMP 状态  
2. **Step**：拼 166 维 transition → 判别器 → `style_reward` → 加到 task reward；写入 replay  
3. **Update**：先 PPO，再 **2 次** LSGAN 判别器更新（专家从 `G1_walk_50hz.npz` 采样，策略从 replay）

判别器结构固定：`166 → 256 → 128 → 1`（ELU）。

| PPO 超参（课程默认） | 值 |
|----------------------|-----|
| clip / entropy | 0.2 / 0.01 |
| \(\gamma\) / \(\lambda\) | 0.99 / 0.95 |
| lr / desired KL | 1e-3 / 0.02 |
| steps_per_env / iterations | 24 / 600 |
| Actor / Critic MLP | (256, 128) + ELU |

Depth 模式：Actor 额外接 Spatial Softmax CNN；训练并行数建议先 **32** 控显存。

#rat2#
## Notebook / 一键流程

```text
公式自检 → smoke(32 env, 16 step) → train → evaluate(32 env, 600 step)
       → record_video(150 帧) → prepare_submission →（可选）grade.py
```

提交物落在 `result/`：`policy.pt`、`model.py`、`student.py`。

#rat1#
## 公式自检结果（已测）

在本机用 CPU PyTorch 跑通 notebook 同款断言：

| 检查 | 结果 |
|------|------|
| `build_amp_state` → `(2, 83)` | 通过 |
| LSGAN：\(D_E=1,D_\pi=-1,\mathrm{gp}=0\Rightarrow L_D=0\) | 通过 |
| `style_reward([1,3]) → [1,0]` | 通过 |
| `normalize_depth` 边界 `[0,0.1,5,8]→[0,0,1,1]` | 通过 |
| `rough_task_reward(0,0) → 1` | 通过 |
| 恒定动作 → `smoothness_penalty=0` | 通过 |

#rat2#
## 待补实验（有 GPU 后）

1. `MODE=height` 跑满训练，记录 TensorBoard / 最终 checkpoint  
2. Held-out 指标：速度跟踪误差、6 m 穿越成功率、平滑度、AMP 相关量  
3. （可选）`MODE=depth` 对比 height  
4. 将评测柱状图 / 视频截帧同步到 `site/static/exp7/`，并回填本节「实验结果」表  

**实验结果（暂缺）**：全量训练与评测依赖 CUDA；完成后再更新本笔记数字与曲线。

#rat1#
## 小结

- 本实验把 [Lec07](短学期_Lec07.html) 的 **PPO** 接到具身 **粗糙地形**，并用 **AMP** 把参考步态先验变成可学的风格奖励。  
- 学生侧核心是 **状态构造、LSGAN、风格/任务奖励与平滑项**——公式部分已完成并通过自检。  
- 剩余工作是 GPU 上的并行仿真训练与正式评分指标采集。
