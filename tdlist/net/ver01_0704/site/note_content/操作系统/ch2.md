---
title: Ch2 Operating-System Structure
date: 2026-09-17
tags: [操作系统, Chapter2, OS Structure]
description: 系统服务与用户接口；系统调用与 API；系统服务/链接加载；机制与策略；单体·分层·微内核·模块·混合；生成与引导；调试概要
source: materials/raw_src_nt_N.md（Operating-System Structures；整理自 NoughtQ / OSC）
---

# Chapter 2 · Operating-System Structures（操作系统结构）

> 依据课程资料 `materials/raw_src_nt_N.md` 第二章整理。  
> 相对 Ch.1 更细地介绍 OS 的服务、接口与内部组织。资料标注的宜深入主题：**系统调用**；**编译、链接和加载**；**操作系统结构**（单体 / 分层 / 微内核 / 模块 / 混合）；**引导加载程序**（bootstrap loader）。  
> 术语体例：关键概念标注学术英文。

**阅读路线**

```diagram
flow
OS 提供哪些服务（user / system）
用户如何交互（CLI · GUI · touch）
程序如何请求服务（API → system-call interface → kernel）
系统服务 / 链接与加载 / 为何应用依赖 OS
设计：机制 vs 策略
内核如何搭（monolithic · layered · microkernel · modules · hybrid）
生成 · 引导 · 调试概要
```

---

## 1. Operating-System Services（操作系统服务）

不同 OS 具体服务不同，但存在共性。分 **用户视角** 与 **系统视角**。

### 1.1 面向用户（User services）

| 服务 | 英文 | 要点 |
|------|------|------|
| **用户接口** | **user interface (UI)** | **GUI**（graphic user interface）；**touch-screen interface**；**CLI**（command-line interface） |
| **程序执行** | **program execution** | 加载到内存、运行、正常/异常退出 |
| **I/O 操作** | **I/O operations** | 针对文件或 I/O 设备 |
| **文件系统操纵** | **file-system manipulation** | 读写文件/目录；创建/删除/查找/罗列；权限管理 |
| **通信** | **communication** | 同机进程间，或经网络的跨机进程间；实现：**shared memory**、**message passing** |
| **错误检测** | **error detection** | 硬件（CPU、内存、I/O）或软件错误；纠正或终止，有时返回 **error code** |

### 1.2 面向系统（System services）

| 服务 | 英文 | 要点 |
|------|------|------|
| **资源分配** | **resource allocation** | 部分资源有特殊 allocation code；另一些用更通用的 request / release code |
| **日志** | **logging** | 使用统计、追踪资源使用，便于配置 |
| **保护与安全** | **protection and security** | **protection**：并发进程不得相互干扰，资源访问受控；**security**：要求用户验证身份 |

---

## 2. User and Operating-System Interface（用户与 OS 接口）

### 2.1 Command Interpreters（命令行解释器）/ Shell

**Command interpreter** 与 **shell** 大致等价（如 bash、zsh、fish）。  
主要功能：获取并执行用户指定的下一条命令。

命令实现方式：

1. 解释器本身包含执行命令的代码；或  
2. 通过**系统程序**实现大多数命令（UNIX 典型做法）。

### 2.2 GUI / Touch-Screen / Choice of Interface

| 接口 | 英文 | 说明 |
|------|------|------|
| 图形界面 | **GUI** | 主流桌面 OS 均提供；Linux 亦有 KDE、GNOME 等 |
| 触摸屏 | **touch-screen interface** | 手机、平板常见 |
| 如何选 | choice of interface | 管理员/资深用户常偏 **CLI**（高效、部分任务仅 CLI、易脚本化）；一般用户常偏 **GUI** |

---

## 3. System Calls（系统调用）

**System calls** 提供访问 OS 服务的接口。多为 C/C++ 编写的函数；部分底层任务须用汇编。

### 3.1 API 与 System-Call Interface

实际程序大量使用 OS，但开发者通常通过 **API**（application programming interface）编程（Windows API、POSIX API、Java API 等），经代码库（如 UNIX/Linux 的 `libc`）访问；库函数在幕后再发起真正的系统调用。

**为何偏好 API 而非直接 syscall**

| 好处 | 英文 | 说明 |
|------|------|------|
| **可移植性** | **portability** | 同一套 API 可在提供该 API 的系统上编译运行；直接 syscall 更复杂 |
| 运行时环境 | **runtime environment (RTE)** | 执行程序所需的软件集合（编译器、解释器、库、加载器等） |

**RTE** 提供 **system-call interface**，链接到内核中的系统调用：每个系统调用常关联一个数字，接口按编号查表，在内核中调用对应例程并返回状态。OS 界面细节多由 API 隐藏、由 RTE 管理。

关系（概念）：

```diagram
flow
应用程序
→ API（如 open()）
→ system-call interface（编号表）
→ 内核中的实际 system call
→ 返回状态
```

**向 OS 传参的通用方法**

1. 经 **registers** 传参  
2. 参数放在内存中的块/表，把**块地址**放入寄存器  
3. 参数 **push** 到 **stack**（再 pop）

### 3.2 Types of System Calls（系统调用类型）

| 类型 | 英文 | 典型操作 |
|------|------|----------|
| **进程控制** | **process control** | 创建/终止；加载/执行；获取/设置进程属性；等待/发事件信号；分配/释放内存 |
| **文件管理** | **file management** | 创建/删除；打开/关闭；读/写/**reposition**；获取/设置文件属性 |
| **设备管理** | **device management** | 请求/释放设备；读/写/重定位；获取/设置设备属性；逻辑连接/断开设备 |
| **信息维护** | **information maintenance** | 获取/设置时间日期；系统数据；进程/文件/设备属性 |
| **通信** | **communication** | 创建/删除连接；发送/接收消息；传递状态；连接/断开远程设备 |
| **保护** | **protection** | 获取/设置权限 |

---

## 4. System Services（系统服务 / 系统实用程序）

**System services**（又称 **system utilities**）为程序开发与执行提供便利环境。有的只是系统调用的用户接口，有的更复杂。

| 类别 | 英文 | 内容 |
|------|------|------|
| 文件管理 | file management | 创建/删除/拷贝/重命名/打印/罗列；访问与操纵文件/目录 |
| 状态信息 | status information | 日期时间、可用内存/磁盘、用户数；性能/日志/调试；部分系统有 **registry** |
| 文件修改 | file modification | 文本编辑器；搜索/转换文本的命令 |
| 编程语言支持 | programming-language support | **compiler**、**assembler**、**debugger**、**interpreter** |
| 程序加载与执行 | program loading and execution | 绝对/可重定位加载器、链接编辑器等；调试系统 |
| 通信 | communication | 进程、用户、计算机间的虚拟连接 |
| 后台服务 | background services | 持续运行的系统进程称服务、**subsystem** 或 **daemon**（守护进程）；常在用户上下文而非内核上下文跑重要活动 |

---

## 5. Linkers and Loaders（链接器与加载器）

程序通常以二进制文件存于磁盘（如 `a.out`、`prog.exe`）。要在 CPU 上运行，须加载到内存并置于某 **process** 上下文中。

| 步骤 | 英文 | 说明 |
|------|------|------|
| 编译 | compile | 源文件 → **relocatable object files**（可加载到任意物理位置的目标文件） |
| 链接 | **linker** | 多个可重定位目标文件（及库）→ 单一 **binary executable** |
| 加载 | **loader** | 把可执行文件装入内存，以便在 CPU 上运行 |
| 重定位 | **relocation** | 为程序各部分分配最终地址，并调整代码/数据以匹配 |

在 shell 中键入程序名（如 `./main`）时的典型路径：

1. shell 经 **`fork()`** 创建新进程  
2. shell 经 **`exec()`** 调用加载器并传入可执行文件名  
3. 加载器使用新进程的地址空间加载该程序  

**Dynamically linked libraries (DLL)**：多数系统允许加载时（或运行需要时）再链接库，避免把未用库静态链进可执行文件。链接器插入重定位信息以支持动态链接。

UNIX/Linux 常见格式：**ELF**（executable and linkable format）。可执行 ELF 含 **entry point**（入口点：运行时第一条指令的地址）。

---

## 6. Why Applications Are Operating-System Specific（应用为何依赖特定 OS）

跨 OS 运行的常见思路：

| 方式 | 说明 |
|------|------|
| 解释型语言 | 解释器在多 OS 上可用（如 Python、Ruby） |
| 带虚拟机的语言 | 如 Java |
| 标准语言 / API | 编译器生成面向特定机器与 OS 的二进制（如 POSIX API） |

实践仍困难，原因包括：

- **应用层**：调用了目标 OS 未提供的 API  
- **系统层**：**binary format**（头、指令、变量布局）不同；UNIX/Linux 多用 **ELF**，但不绑定特定 CPU 架构，故不能保证跨硬件可跑；**instruction set** 不同；**system calls** 的操作数、顺序、调用约定不同  

**ABI**（application binary interface）：定义二进制组件如何与特定架构上的特定 OS 交互（地址宽度、syscall 传参、运行时栈组织、系统库二进制格式、数据类型大小等）。按某 ABI 编译链接的可执行文件可在支持该 ABI 的系统上运行，但 ABI 通常绑定「给定架构 + 特定 OS」，**跨平台兼容有限**。

---

## 7. Operating-System Design and Implementation（设计与实现）

### 7.1 Mechanisms and Policies（机制与策略）

| | **机制**（mechanism） | **策略**（policy） |
|--|------------------------|---------------------|
| 是什么 | 实现某功能的低层方法/协议；“机械结构” | OS 内做决策的算法；“智慧” |
| 回答 | **how**（如何做） | **which**（选哪个） |
| 例子 | **context switch**（上下文切换） | **scheduling policy**（调度策略） |

将 **mechanism** 与 **policy** 分离：改策略时不必重做机制 → 一种 **modularity**，符合软件设计通用原则。

### 7.2 Implementation

早期 OS 多用汇编；现代多数用高级语言（C/C++），少数仍用汇编。高级语言实现的优势：写得更快、结构更紧凑、易理解调试；编译器进步可提升生成代码质量；更易 **port** 到其他硬件。潜在代价是速度与存储，但现代编译器优化与现代处理器流水线使该问题通常不严重。

---

## 8. Operating-System Structure（操作系统结构）——核心

规模大、复杂的系统须精心设计：将任务分解为小型**组件/模块**，各有清晰接口与功能，而非单一不可分整体。

### 8.1 Monolithic Structure（单体结构）

**Monolithic structure**：将所有内核功能放入**单一静态二进制**，运行在**单一地址空间** —— 最简单、常用的组织方式。

- 经典 UNIX：大致分为 **kernel** 与 **system programs**；内核含接口与设备驱动等。系统调用接口以下、硬件以上均为内核；大量功能在同一地址空间。  
- **Linux**：基于 UNIX，应用常经 `glibc` 与系统调用接口通信；内核在内核态跑在单一地址空间 → **monolithic**；同时可 **modular**（见下），运行时可修改。

| 优点 | 缺点 |
|------|------|
| 简单；**system-call 开销小**；内核内通信快 → **performance** 好 | **难以实现和扩展**（紧耦合） |

单体常称 **tightly coupled**：改一部分可能广泛影响其他部分。

### 8.2 Layered Approach（分层法）

相对：**loosely coupled** —— 划分成独立、功能有限的小组件。

**Layered approach**：OS 分成若干层；第 0 层为硬件，最高层（第 N 层）为用户界面。层 M 含数据结构与供更高层调用的函数，并可调用更低层。

| 优点 | 困难 / 代价 |
|------|-------------|
| 构建与调试简单：自下而上逐层调试；错误多可定位在当前层；向上隐藏数据结构/操作/硬件 | **难以恰当定义每一层功能**；用户请求穿越多层 → **开销**大 |

纯分层 OS 较少；分层思想在网络（TCP/IP）、Web 等更常见。

### 8.3 Microkernels（微内核）

**Microkernel**：移除内核中所有非必要组件，将其作为**用户级程序**放在分离的地址空间 → 内核更小。通常仅保留最基本的 **process / memory management** 与 **communication**。

客户端与用户态服务之间经微内核用 **message passing** 通信（不直接互动）。例如访问文件须与文件服务器交换消息。

| 优点 | 缺点 |
|------|------|
| 易扩展（新服务加在用户空间）；内核改动少；易移植；服务失败不一定拖死整机 → **security / reliability** 更好 | 用户态服务间通信需**消息复制**与可能的**进程切换** → **performance** 开销大 |

### 8.4 Modules（可加载内核模块）

**Loadable kernel modules (LKM)**：内核含一组核心组件，启动时或运行时再链接额外服务。现代 UNIX 常见。

- 核心理念：基础服务在内核；其他功能**动态**实现，避免每次改功能都重编译整个内核。  
- 像分层：各部分有明确受保护接口；但更灵活——**任何模块可调用其他模块**。  
- 像微内核：主模块偏核心 + 加载/通信机制；但更高效——**模块间不必经消息传递**。

Linux 主要用 LKM 支持设备驱动与文件系统；可在启动或运行时插入/移除。兼顾单体性能与动态模块化。

### 8.5 Hybrid Systems（混合系统）

很少有 OS 只用单一严格结构；多为 **hybrid systems**，兼顾 performance、security、可用性：

| 例子 | 结构组合 |
|------|----------|
| **Linux** | **monolithic**（单地址空间 → 高效）+ **modular**（LKM 动态加功能） |
| **Windows** | 大体 **monolithic**（性能）；保留部分 **microkernel** 式行为（用户态独立子系统）；并支持动态可加载内核模块 |

```diagram
flow
应用 / 系统程序
→ system-call interface
→ 内核结构（monolithic / layered / microkernel / LKM / hybrid）
→ 硬件
```

---

## 9. Building and Booting an Operating System（构建与启动）

### 9.1 Operating-System Generation（系统生成）

从头构建 OS 的典型步骤：

1. 编写（或获取）源代码  
2. 为将要运行的目标系统做配置  
3. 编译 OS  
4. 安装 OS  
5. 启动计算机及新 OS  

### 9.2 System Boot（系统引导）

多数系统启动步骤：

1. **bootstrap program** / **boot loader**（引导程序 / 引导加载程序）定位内核  
2. 内核加载到内存并启动  
3. 内核初始化硬件  
4. **根文件系统**被挂载  

> **Boot loader 不是操作系统的一部分。**

**多阶段启动（BIOS 路径，概念）**

1. 通电后运行固件中的小型引导程序（**BIOS**，basic input/output system）  
2. 加载位于硬盘固定位置 **boot block**（启动块）上的第二阶段引导程序  
3. 后者可能直接装入整个 OS，或因块小而仅知道后续引导代码的位置与长度  

许多现代系统用 **UEFI**（unified extensible firmware interface）取代 BIOS：更好支持 64 位与大硬盘；作为完整启动管理器，常比多阶段 BIOS **启动更快**。

引导程序还可做诊断（查内存/CPU/设备）、初始化（CPU 寄存器、设备控制器、主存等），再启动 OS 并挂载根文件系统 —— 此后才认为系统正式运行。

**Linux 补充（资料）**：内核映像常压缩，载入后解压；引导时常建临时 RAM 文件系统 **initramfs**（含挂载真根文件系统所需驱动/模块）；就绪后切换到真正的根文件系统；创建初始进程（如 **systemd**），再启动其他服务，最终出现登录提示。

---

## 10. Operating-System Debugging（调试概要）

**Debugging**：查找并修复硬件/软件错误；广义也可含 **performance tuning**（消除瓶颈）。

| 概念 | 英文 | 说明 |
|------|------|------|
| 进程故障 | failure analysis | 错误写入 **log files**；可 **core dump**（捕获进程内存）供调试器分析 |
| 内核故障 | **crash** | 更难调试；错误记日志，内存状态可写入 **crash dump** |
| 性能观察 | monitoring | **per-process** 或 **system-wide**；手段：**counters** 或 **tracing** |

Linux 例子（资料）：计数器类 — `ps`、`top`、`vmstat`、`netstat`、`iostat`（多读自 **`/proc`** 伪文件系统）；追踪类 — `strace`、`gdb`、`perf`、`tcpdump`。

---

## 附录 · 与 Ch.1 的衔接

| Ch.1 | Ch.2 深化 |
|------|-----------|
| kernel / system program / application | 系统服务、系统调用类型、单体内核边界 |
| system call · dual-mode · trap | API → system-call interface → 内核；传参方式 |
| bootstrap / firmware | boot loader、BIOS/UEFI、挂载根文件系统 |
| sharing · isolation · abstraction | 机制/策略分离；微内核 isolation vs 单体 performance；file/UI 等抽象接口 |
