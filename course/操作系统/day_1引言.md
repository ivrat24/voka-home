---
title: Day1 引言
date: 2026-09-17
tags: [操作系统, Day1, 引言, Chapter1]
description: 严格对照 ch1.pptx：Course Overview + Chapter 1 Introduction（OSC 表述与学术英文）
source: materials/ch1.pptx（Lecture 1: Overview / Chapter 1 Introduction）
---

# Day1 引言（Introduction）

> 整理原则：**表述对齐课件 `materials/ch1.pptx`**；关键术语标注学术英文。  
> 结构：§0 课程行政（Slides 1–15）→ §1 起为 **Chapter 1 Introduction**（Slides 16–56）。  
> 课件未展开、仅作备查的内容见文末附录。

**Chapter 1 大纲（Outlines for Chapter ONE）**

What Operating Systems Do · Computer-System Organization · Computer-System Architecture · Operating-System Structure · Operating-System Operations · Process Management · Memory Management · Storage Management · Protection and Security · Distributed Systems · Special-Purpose Systems · Computing Environments

**Objectives（课件）**

- To provide a grand tour of the major operating systems components  
- To provide coverage of basic computer system organization  

---

## 0. Course Overview（课程总览）

### 0.1 课在问什么（Operating Systems: Course Overview）

How computers run programs and manage resources, with hands-on practice in system design.

| 主题 | 课件要点 |
|------|----------|
| Program execution | How do programs share processors? How do threads coordinate safely? How does virtual memory work? How are files stored? How do systems recover from crashes? |
| Software and hardware | **System calls**, **kernels** and **interrupts**. **Context switches** and **page tables**. How apps obtain OS services. How the OS controls hardware. |
| System design and explanation | Build correct software, write clear code, and explain the reasons for your design. |
| Prerequisites | C programming, data structures, basic RISC-V assembly and Linux tools. |

**Main Contents**

| 块 | 内容 |
|----|------|
| Overview | Intro, OS structure |
| Process Management | Processes, Threads, CPU scheduling, Process Synchronization, Deadlocks |
| Memory Management | Main memory, Virtual memory |
| Storage Management | File-system interface, File-system implementation, Mass-storage structure, I/O systems |

### 0.2 为何仍学 OS / 教材与 xv6

- **Why is OS still important in ChatGPT-era?** 摩尔定律之后，*Software performance engineering*、算法与硬件顶层优化仍可大幅提升性能（课件引用 Science 文与矩阵乘例子）。  
- **Why To Learn Operating Systems?** Building blocks of modern computer software：System Software · Algorithm · Data Structure · Applications。  
- 课件亦列举 AI/Cloud 中对 **virtual memory and paging**、**scheduling and migration**、**sandboxes**、GPU memory ballooning、fine-grained scheduling、elastic VM memory 等 OS 思想的复用（vLLM、Llumnix、Dirigent、Prism、Libra、RamRyder 等）。

| 资源 | 课件表述 |
|------|----------|
| *Operating System Concepts*, 10th edition（Silberschatz, Galvin, Gagne） | 主教材；os-book.com/OS10/ |
| OSTEP | Supplementary reading |
| courses.zju.edu.cn | Course website and lecture slides |
| **xv6** | A small kernel you can read；Unix-like teaching OS for multicore RISC-V；`kernel/proc.c`, `kernel/vm.c` |
| MIT 6.1810 | Operating System Engineering（page tables, traps, locking, …） |

### 0.3 Final Grade 与 Lab Projects

| 项目 | 占比 |
|------|------|
| Final exam | 50% |
| Lab Exam（上机考试） | 10% + Bonus |
| Assignments / homework | 5% |
| In-class Quiz | 5% |
| Lab Reports（实验报告） | 10% |
| Lab Demos（实验验收） | 20% |

| Lab | 内容 | 权重 |
|-----|------|------|
| Lab0 | RISC-V 64 Kernel Debug | 5%（Project Report, **NO Demo**） |
| Lab1 | Kernel Booting & Timer | 15% |
| Lab2 | Scheduling, Context Switching | 15% |
| Lab3 | Virtual Memory | 15% |
| Lab4 | User Mode (shell) | 20% |
| Lab5 | Page fault and Fork | 30% |
| Lab6 | File System | 10% |

Lab1–6：Project Report + Demo with TA。代码须详细注释（课件：每 5 行有注释）；「讨论心得」占该实验报告 20%。独立完成，禁止抄袭/协助抄袭。  
Docs：`https://os.pages.zjusct.io/fa26/doc-shoulidan` · Repo：`https://git.zju.edu.cn/os/fa26/shoulidan/os-<ID>`

**Suggestions for Learning OS（课件）**：Read before and after class · Trace an execution path（system call / page fault）· Implement and test incrementally · Debug with evidence（GDB/QEMU）· Explain your design · Reason independently。

---

## 1. What is an Operating System?（操作系统是什么）

### 1.1 定义与 goals

**Operating system**：A program that acts as an **intermediary** between a **user** of a computer and the computer **hardware**.

**Operating system goals：**

1. Execute user programs and make solving user problems easier.  
2. Make the computer system **convenient** to use.  
3. Use the computer hardware in an **efficient** manner.  

### 1.2 Computer System Structure（四组成部分）

Computer system can be divided into **four components**：

| 组成部分 | 英文 | 课件表述 |
|----------|------|----------|
| **硬件** | **hardware** | provides basic computing resources — **CPU**, **memory**, **I/O devices** |
| **操作系统** | **operating system** | Controls and **coordinates** use of hardware among various applications and users |
| **系统与应用程序** | **system & application programs** | define the ways in which the system resources are used to solve the computing problems of the users（word processors, compilers, web browsers, database systems, video games） |
| **用户** | **users** | People, machines, other computers |

### 1.3 Operating System Definition（资源分配器与控制程序）

| 角色 | 英文 | 课件表述 |
|------|------|----------|
| **资源分配器** | **resource allocator** | Manages all resources; Decides between conflicting requests for **efficient** and **fair** resource use |
| **控制程序** | **control program** | Controls execution of programs to prevent errors and improper use of the computer |

**No universally accepted definition.**

- “Everything a vendor ships when you order an operating system” is a good approximation — but varies wildly.  
- “The one program running at all times on the computer” is the **kernel**.  
- Everything else is either a **system program** (ships with the operating system) or an **application program**.

### 1.4 Computer Startup（开机）

- **bootstrap program** is loaded at power-up or reboot.  
- Typically stored in **ROM** or **EPROM**, generally known as **firmware**.  
- Initializes all aspects of system.  
- Loads operating system **kernel** and starts execution.

---

## 2. Computer-System Organization（计算机系统组织）

### 2.1 Computer-system operation

- One or more **CPUs**, **device controllers** connect through **common bus** providing access to **shared memory**.  
- **Concurrent execution** of CPUs and devices competing for **memory cycles**.

**Computer-System Operation（I/O 与中断）**

- I/O devices and the CPU can execute **concurrently**.  
- Each **device controller** is in charge of a particular device type.  
- Each device controller has a **local buffer**.  
- CPU moves data from/to **main memory** to/from local buffers.  
- I/O is from the device to local buffer of controller.  
- Device controller informs CPU that it has finished its operation by causing an **interrupt** (via **system bus**).

### 2.2 Common Functions of Interrupts（中断）

- **Interrupt** transfers control to the **interrupt service routine (ISR)** generally through the **interrupt vector**, which contains the addresses of all the service routines.  
- Interrupt architecture must **save the address of the interrupted instruction**.  
- Incoming interrupts are **disabled** while another interrupt is being processed to prevent a **lost interrupt**.  
- An operating system is **interrupt driven**.  
- Note: names may vary across architectures；课件注明 **RISC-V terms**.

**中断分类（课件原表述）**

| 分类 | 英文（课件） | 说明 |
|------|--------------|------|
| 硬件驱动的中断 | **Interrupt driven by hardware** | 如 device controller 经 system bus 引发的 interrupt |
| **陷阱** | **trap** | a **software-generated interrupt** caused either by an **error** or a **user request**（后者常称 **system call**） |

Operating-System Operations 中亦写：Software error or request creates **exception** or **trap**（例：division by zero；request for operating system service）。

**Interrupt Handling**

- OS preserves CPU state by storing **registers** and the **program counter (PC)**.  
- Determines which type of interrupt has occurred:  
  - a **generic routine** examines the interrupt info；或  
  - **vectored interrupt system**, indexed by a unique number.  
- Separate segments of code determine what action should be taken for each type of interrupt.

### 2.3 I/O Structure — Two I/O Methods

| | **Synchronous**（同步） | **Asynchronous**（异步） |
|--|-------------------------|--------------------------|
| 课件要点 | After I/O starts, control returns to user program **only upon I/O completion**. | After I/O starts, control returns to user program **without waiting for I/O completion**. |
| 机制 | **Wait** instruction idles the CPU until the next interrupt；或 **Wait loop** (contention for memory access). At most **one** I/O request outstanding；no simultaneous I/O processing. | **System call** — request to the OS to allow user to wait for I/O completion. **Device-status table** contains entry for each I/O device indicating its **type**, **address**, and **state**. |

### 2.4 Direct Memory Access（DMA）

- Used for **high-speed I/O devices** able to transmit information at close to memory speeds.  
- Device controller transfers **blocks** of data from buffer storage directly to **main memory without CPU intervention**.  
- Only **one interrupt** is generated **per block**, rather than one interrupt per byte.

### 2.5 Storage Structure（存储结构）

| 术语 | 英文 | 课件表述 |
|------|------|----------|
| **主存** | **main memory** | only large storage media that the CPU can access **directly** |
| **辅存** | **secondary storage** | extension of main memory that provides large **nonvolatile** storage capacity |
| **磁盘** | **magnetic disks** | surface divided into **tracks**, subdivided into **sectors**；**disk controller** determines the logical interaction between the device and the computer |

**Storage Hierarchy**：Storage systems organized in hierarchy — **Speed**, **Cost**, **Volatility**.

**Caching**：copying information into faster storage system；main memory can be viewed as a last **cache** for secondary storage.

**Caching（展开，课件）**

- Important principle, performed at many levels（hardware, operating system, software）.  
- Information in use copied from slower to faster storage temporarily — **Speed mismatch**.  
- Faster storage (**cache**) checked first；hit → use from cache；miss → copy to cache and use.  
- Cache smaller than storage being cached.  
- Cache management：important design problem — **cache size** and **replacement policy**.

Movement between levels of storage hierarchy can be **explicit** or **implicit**.

**Migration of Integer A from Disk to Register（课件）**

- **Multitasking** environments must be careful to use the **most recent value**, no matter where it is stored in the storage hierarchy.  
- **Multiprocessor** environment must provide **cache coherency** in hardware such that all CPUs have the most recent value in their cache.

**Storage-Device Hierarchy（课件图，常见 ≥7 层，自上而下变慢变大）**

| 层 | 英文 |
|----|------|
| 1 | **registers** |
| 2 | **cache** |
| 3 | **main memory** |
| 4 | solid-state / electronic disk（SSD 等，教材图常见） |
| 5 | **magnetic disk** |
| 6 | optical disk |
| 7 | magnetic tapes |

```diagram
flow
registers
cache
main memory
SSD / electronic disk
magnetic disk
optical disk
magnetic tapes
```

---

## 3. Computer-System Architecture（体系结构）

### 3.1 Multiprocessor Systems — SMP

**SMP architecture（symmetric multiprocessing）**

- Each CPU processor has its **own set of registers**.  
- All processors **share physical memory** over the **system bus**.

### 3.2 Multicore Systems

- **On-chip communication** is faster than **between-chip communication**.  
- **Less power** (good for mobile devices).

### 3.3 The NUMA Architecture

**NUMA** = Non-Uniform Memory Access.

- The CPUs are connected by a **shared system interconnect**.  
- Scales more effectively as more processors are added.  
- **Remote memory** across the interconnect is **slow**.  
- Operating systems need careful **CPU scheduling** and **memory management**.

```diagram
flow
CPU + local memory  ←local fast
        ↕ shared system interconnect（remote slow）
CPU + local memory
```

---

## 4. Operating-System Structure & Operations（结构与运转）

### 4.1 Multiprogramming（多道程序设计）

**Multiprogramming** needed for efficiency（**CPU utilization**）.

- Single user cannot keep CPU and I/O devices busy at all times.  
- Multiprogramming organizes **jobs** (code and data) so CPU always has one to execute.  
- A **subset** of total jobs in system is kept in memory.  
- One job selected and run via **job scheduling**.  
- When it has to wait (for I/O for example), OS **switches** to another job.

### 4.2 Timesharing (multitasking)（分时 / 多任务）

**Timesharing (multitasking)** is **logical extension** in which CPU switches jobs so **frequently** that users can interact with each job while it is running, creating **interactive computing** (**interactivity**).

- **Response time** should be **< 1 second**.  
- Each user has at least one program executing in memory → **process**.  
- If several jobs ready to run at the same time → **CPU scheduling**.  
- If processes don’t fit in memory, **swapping** moves them in and out to run.  
- **Virtual memory** allows execution of processes not completely in memory.  

（**swapping** / **virtual memory** 与 memory management activities 的展开见 §6.1。）

| | **Multiprogramming** | **Timesharing (multitasking)** |
|--|----------------------|--------------------------------|
| 目的 | efficiency / **CPU utilization** | **interactivity**；response time < 1 s |
| 课件关系 | 基础 | **logical extension** of multiprogramming |
| 切换 | 典型在 wait（如 I/O）时 switch | switches jobs **so frequently** |

### 4.3 Operating-System Operations（双模式与保护）

- Interrupt driven by **hardware**.  
- Software error or request creates **exception** or **trap**（division by zero；request for operating system service）.  
- Other process problems：**infinite loop**；processes **modifying** each other or the operating system.  
- Thus we need **protection**.

**Dual-mode operation** allows OS to protect itself and other system components：

| 模式 | 英文 | 课件要点 |
|------|------|----------|
| **用户模式** | **user mode** | running user code |
| **内核模式** | **kernel mode** | running kernel code |

- **Mode bit** provided by hardware — distinguish user code vs kernel code.  
- Some instructions designated as **privileged**, only executable in **kernel mode**.  
- **System call** changes mode to kernel；return from call resets it to user.

**Privileged instructions（特权指令）**：仅能在 kernel mode 执行的指令（课件：only executable in kernel mode）。典型如：改 mode / 中断使能、设 timer、改地址翻译相关状态等（具体助记符依体系结构；RISC-V 实验见 CSR / `sret` 等）。用户态不可直接执行；需经 **system call** 由内核代做。

### 4.4 Timer（定时器）— Transition from User to Kernel Mode

**Timer** to prevent **infinite loop** / process **hogging** resources：

1. Set interrupt after specific period.  
2. Operating system **decrements counter**.  
3. When counter zero → generate an **interrupt**.  
4. Set up before scheduling process to **regain control** or **terminate** program that exceeds allotted time.

---

## 5. Process Management（进程管理）

### 5.1 进程定义（课件）

- A **process** is a **program in execution**. It is a **unit of work** within the system.  
- Program is a **passive entity**；process is an **active entity**.  
- Process needs resources to accomplish its task：**CPU**, **memory**, **I/O**, **files**；**Initialization data**.  
- Process **termination** requires **reclaim of any reusable resources**.  
- **Single-threaded process** has one **program counter** specifying location of next instruction to execute；executes instructions sequentially, one at a time, until completion.  
- **Multi-threaded process** has one **program counter per thread**.  
- Typically system has many processes, some user, some operating system, running concurrently on **one or more CPUs**.  
- Concurrency by **multiplexing the CPUs** among the processes / threads.

### 5.2 Process Management Activities（课件清单）

The operating system is responsible for:

| 活动 | 英文 |
|------|------|
| 创建与删除 | **Creating** and **deleting** both user and system processes |
| 挂起与恢复 | **Suspending** and **resuming** processes |
| 同步 | Providing mechanisms for process **synchronization** |
| 通信 | Providing mechanisms for process **communication** |
| 死锁 | Providing mechanisms for **deadlock** handling |

---

## 6. Memory / Storage / I/O Management（资源管理摘要）

### 6.1 Memory Management（内存管理）

#### 基本约束（课件）

- All **data** must be in memory before and after processing.  
- All **instructions** must be in memory in order to execute.  

因此：CPU 真正“算”的时候，相关指令与数据必须落在 **main memory**（课件：only large storage media that the CPU can access **directly**）。辅存上的内容要先进入主存（或经 caching 层次迁移）才能被执行/处理。

**Memory management** determines **what is in memory when** — 目标包括 optimizing **CPU utilization** and computer **response** to users。

#### Memory management activities（课件三条）

| # | 英文（课件） | 含义 |
|---|--------------|------|
| 1 | Keeping track of which parts of memory are currently being used and by whom | **记账**：哪些物理内存被占用、属于谁（哪个 process） |
| 2 | Deciding which processes (or parts thereof) and data to move into and out of memory | **搬移决策**：整进程或进程的一部分、数据何时换入/换出主存 |
| 3 | Allocating and deallocating memory space as needed | **分配与回收**：按需给进程空间，用完释放 |

```diagram
flow
指令与数据必须在 main memory 才能执行/处理
→ Memory management：what is in memory when
→ 记账 · 换入换出 · 分配/回收
→ 提高 CPU utilization · 改善 response
```

#### 与多道 / 分时的衔接（Operating System Structure）

| 机制 | 英文 | 课件要点 |
|------|------|----------|
| 多道下的内存驻留 | subset of total jobs kept in memory | 并非所有作业同时进主存；留下一个子集供切换 |
| 装不下时 | **swapping** | moves processes in and out to run（整进程换入换出） |
| 不必全部在内存也能跑 | **virtual memory** | allows execution of processes **not completely in memory** |

**Swapping** 与 **virtual memory** 都服务 “物理主存有限、逻辑上却要跑更多/更大进程”，但粒度与观感不同（引言级）：

| | **Swapping** | **Virtual memory** |
|--|--------------|-------------------|
| 课件原句 | moves them in and out to run | allows execution of processes not completely in memory |
| 直观理解 | 进程（或大部分映像）在主存与辅存之间整进整出 | 进程可以只有一部分在主存，其余在盘上，需要时再进入 |
| 目的 | 让更多进程有机会轮流占用主存 | 支持更大地址空间、更高 multiprogramming degree，并配合 isolation（每进程自己的逻辑视图——后章展开） |

> Chapter 1 只建立概念；**page table**、缺页、替换算法等属后续 Memory Management / Virtual memory 专章（课件 Main Contents 已单列）。实验 Lab3 Virtual Memory、Lab5 Page fault 会落地。

#### 和存储层次、一致性的关系

- 主存是层次中 CPU **直接访问**的一层；其“上下”还有 cache 与 secondary storage（见 §2.5）。  
- **Multitasking** 下须保证用到的是 hierarchy 中的 **most recent value**；**multiprocessor** 下硬件提供 **cache coherency**。  
- Memory management 决定的 “what is in memory when”，必须与 caching / secondary storage 上的副本策略协调（细节后章）。

#### 管理目标小结

| 目标 | 英文 | 体现 |
|------|------|------|
| 利用率 | **CPU utilization** | 多进程可运行映像尽量就绪，少因“人不在内存”而闲置 |
| 响应 | **response** to users | timesharing 下用户进程所需页/段能及时进入主存 |
| 共享下的安置 | sharing + isolation | 多进程同驻主存时划清各用哪部分（activities 第 1、3 条） |
| 容量幻觉 | virtual memory | 逻辑上可运行不完全在物理内存中的进程 |

### 6.2 File 与 File-System Management（文件与文件系统）

#### File 是什么（课件）

OS provides a **uniform, logical view** of information storage.  
Abstracts physical properties to a logical storage unit — **file**.

| 概念 | 英文 | 含义 |
|------|------|------|
| **文件** | **file** | 信息存储的**逻辑单元**；对用户隐藏磁盘/磁带等物理细节 |
| 统一逻辑视图 | **uniform, logical view** | 不论底下是 HDD、SSD 还是磁带，上层都按“文件”来用 |
| 抽象 | **abstraction** | abstracts **physical properties** of the storage medium |

这与 §7.3 Abstraction 一致：file 是 persistence（持久保存）侧最核心的抽象之一。

#### 物理介质仍在，但由设备管

- Each **medium** is controlled by a **device**（e.g. disk drive, tape drive）.  
- 介质属性各异（课件）：**access speed**、**capacity**、**data-transfer rate**、**access method**（**sequential** or **random**）。  
- 用户通常不直接按 track/sector 编程，而是通过 file 接口；把 file **mapping** 到 **secondary storage** 是 OS 的事。

```diagram
flow
用户 / 程序：open · read · write（逻辑 file）
→ File-system management
→ Mapping onto secondary storage
→ disk / tape 等 device（physical properties 各异）
```

#### File-System management（文件系统管理）

**Directories（目录）**：Files usually organized into **directories** — 用树状/层级名字空间组织大量 files，便于查找与管理。

**Access control（访问控制）**：on most systems, to determine **who can access what** — 支撑 **isolation** / **security**（未授权者不能读写他人文件）。

**OS activities include（课件清单）：**

| 活动 | 英文 |
|------|------|
| 创建与删除 | Creating and deleting **files** and **directories** |
| 基本操作原语 | **Primitives** to manipulate files and **dirs** |
| 映射到辅存 | **Mapping** files onto **secondary storage** |
| 备份 | **Backup** files onto stable (**non-volatile**) storage media |

> “Primitives”：读、写、定位、改名等由 OS 提供的基本文件操作（具体 API 如 `open`/`read`/`write` 属系统调用接口，后章展开）。

#### 与进程、内存、I/O 的关系（引言级）

| 关联 | 说明 |
|------|------|
| Process 需要 files | 课件：process needs … **files**；打开的文件是进程资源的一部分，终止时要 reclaim |
| 与 main memory | 文件数据要进 CPU 处理，通常先读入 memory（或经 buffering/caching） |
| 与 I/O subsystem | 真正的块传输靠设备驱动；**buffering** / **caching** / **spooling** 常为文件 I/O 服务 |
| 与 mass-storage | file 的字节最终落在磁盘等；空闲空间、分配、**disk scheduling** 影响文件访问 **speed** |

#### 小结

**File** = 对辅存上信息的**逻辑抽象**；**file system** = 用 directories组织文件、做访问控制，并把逻辑文件映射到物理介质、支持备份。Chapter 1 建概念；实现（inode、分配方式、目录结构细节）在后续 File-system interface / implementation 专章。

### 6.3 Mass-Storage Management

- Disks store data that does not fit in main memory or must be kept for a “long” period.  
- Entire **speed** of computer operation hinges on disk subsystem and its algorithms.

**OS activities：** Free-space management · Storage allocation · Disk scheduling.

**Tertiary storage**：optical storage, magnetic tape；WORM (write-once, read-many-times) vs RW (read-write).

### 6.4 I/O Subsystem

- One purpose of OS is to **hide peculiarities** of hardware devices from the user — ease of usage & programming.

**I/O subsystem responsible for：**

| 机制 | 英文 | 课件释义 |
|------|------|----------|
| **缓冲** | **buffering** | storing data temporarily while it is being transferred |
| **缓存** | **caching** | storing parts of data in faster storage for performance |
| **假脱机** | **spooling** | the overlapping of output of one job with input of other jobs |

另有：General **device-driver interface**；Drivers for specific hardware devices.

---

## 7. OS Purposes（基本需求）

Basic requirements for OS（课件 **OS Purposes**）：

| 英文 | 中文对照 | 一句话 |
|------|----------|--------|
| **Sharing / multiplexing** | 共享 / 多路复用 | 有限资源给多方用 |
| **Isolation** | 隔离 | 共用时互不乱踩、不拖死系统 |
| **Interaction** | 交互 | 用户/进程能对话、能协同 |
| **Abstraction** | 抽象 | 隐藏细节，提供统一易用接口 |
| **Security** | 安全 | 防恶意与未授权使用（与 isolation/protection 紧密相关） |
| **Performance** | 性能 | 少浪费、高利用率、可接受的响应 |
| Range of uses | 使用范围 | 同一套思想覆盖桌面/服务器/嵌入式等 |

课件 **operating system goals** 亦可对照：make solving problems **easier** · make the system **convenient** to use · use hardware in an **efficient** manner —— 分别贴近 abstraction / convenience、sharing+performance。

以下重点完善 **Sharing / multiplexing**、**Isolation**、**Abstraction**，并与前文机制一一挂钩。

### 7.1 Sharing / multiplexing（共享 / 多路复用）

#### 定义

- **Sharing（共享）**：多个 **users** / **processes** / programs 共同使用同一套物理资源（**CPU**, **memory**, **I/O**, **files** 等），而不是一人独占整机。  
- **Multiplexing（多路复用）**：实现 sharing 的基本手法——把资源在**时间**或**空间**上“切开”轮流或并存地分给多方。课件原文：Concurrency by **multiplexing the CPUs** among the processes / threads。

OS 作为 **resource allocator**：Manages all resources；Decides between conflicting requests for **efficient** and **fair** resource use。

#### 为什么需要（课件动机）

Single user cannot keep **CPU** and **I/O devices** busy at all times → 需要 **multiprogramming** for efficiency（**CPU utilization**）：organizes **jobs** so CPU always has one to execute；wait（如 I/O）时 switch to another job。

进一步，**timesharing (multitasking)** 把 CPU **frequently** 分给多人，使 **interactive computing** 成为可能（**response time** < 1 s）。

#### 两种常见复用方式

| 类型 | 英文 | 含义 | 课件中的例子 |
|------|------|------|--------------|
| **时间多路复用** | time multiplexing | 同一资源在不同时刻给不同进程 | CPU：**job scheduling** / **CPU scheduling**；timer 强制换人 |
| **空间共享** | space sharing | 同一时刻多方各占资源的一部分 | 内存中同时保留 jobs 的一个 **subset**；后文虚拟内存再细化“觉得自己有一整块地址空间” |

设备侧也可共享：多个进程经 OS 排队使用磁盘/网卡（配合 **device-status table**、磁盘 **scheduling** 等）。

#### 共享什么、冲突从哪来

| 资源 | 共享时要调度/管理的内容 |
|------|-------------------------|
| CPU | 谁上处理器、时间片多长（multiplexing the CPUs） |
| memory | 哪段给谁；换入换出（memory management activities） |
| I/O / disk | 请求排队、DMA、disk scheduling |
| files | 多进程打开同一逻辑文件时的一致性与 **access control** |

冲突请求（conflicting requests）必须由 OS **裁决**，否则无法同时满足 “efficient” 与 “fair”。

```diagram
flow
有限硬件（CPU · memory · I/O · files）
→ Sharing：多方同时想用
→ Multiplexing：时间切开 / 空间切开
→ Resource allocator：efficient + fair
→ 结果：更高 CPU utilization · 可交互的 timesharing
```

### 7.2 Isolation（隔离）

#### 定义与动机

**Isolation**：在允许 sharing 的前提下，限制进程/用户的可见范围与能力，使其**不能任意读写他人状态、不能任意操控硬件、不能永久霸占 CPU**。

课件动机（Operating-System Operations）：

- Software error / request → **exception** or **trap**  
- **infinite loop**；processes **modifying** each other or the operating system  
- Thus we need **protection**  
- **Dual-mode operation** allows OS to protect itself and other system components  

换言之：**没有 isolation，sharing 会变成互相破坏。**

#### 隔离的层次（与课件机制对应）

| 层次 | 英文 | 课件机制 | 隔开什么 |
|------|------|----------|----------|
| 特权边界 | **user mode** / **kernel mode** | **mode bit**；**privileged** instructions only in kernel mode | 用户不能直接执行特权操作、乱控硬件 |
| 进入内核的受控门 | **system call** | changes mode to kernel；return resets to user | 只能按 OS 规定的接口请求服务 |
| CPU 时间隔离 | 防 hogging | **timer** interrupt → OS **regain control** or terminate | 一个死循环不能永远占 CPU |
| 信息/文件隔离 | who can access what | **access control** on files / directories | 未授权者不能读写他人文件 |
| 故障隔离（目标） | protect OS & others | dual-mode + 内核代管资源 | 用户态错误尽量不拖死整个系统 |

> **Isolation** 与课件清单中的 **Security** 相邻：isolation/protection 多强调“机制上分边界”；security 还包含策略与对抗恶意行为。引言级先抓住 dual-mode + privileged + system call + timer + access control。

#### 与 Sharing 的张力

| 只强调 Sharing | 只强调 Isolation |
|----------------|------------------|
| 利用率高，但易互相修改、互相拖死 | 很安全，但若完全不共享则浪费资源、无法多用户 |
| 需要 isolation 补上保护 | 需要在边界内仍做 multiplexing |

设计目标：在 **isolation** 划出的安全边界**之内**做尽可能高效的 **sharing / multiplexing**。

```diagram
flow
问题：modifying each other · infinite loop · improper use
→ Protection / Isolation
→ dual-mode · privileged · system call · timer · access control
→ OS 与进程、进程与进程之间有边界
```

### 7.3 Abstraction（抽象）

#### 定义与动机

**Abstraction**：向 user / programmer 隐藏硬件与策略细节，提供**更简单、统一、稳定**的接口，使系统 **convenient to use**，并让 “solving user problems easier”（课件 OS goals）。

课件直接表述的抽象动作：

- OS acts as an **intermediary** between user and hardware  
- I/O subsystem：**hide peculiarities** of hardware devices — ease of usage & programming  
- Storage：uniform, **logical view** → logical storage unit **file**（abstracts physical properties of media）

#### 抽象金字塔（由下到上）

| 层 | 看到的对象 | 英文 | 隐藏了什么 |
|----|------------|------|------------|
| 硬件 | 寄存器、总线、控制器、磁道扇区… | hardware / device controllers / tracks · sectors | — |
| 内核机制 | 中断、调度、页表… | interrupt, scheduling, … | 电气与时序细节 |
| 系统调用接口 | open/read/write、进程创建… | **system call** | 具体 trap 号、驱动内部 |
| 逻辑资源 | **file**、**process**、目录 **directories** | file as logical storage unit | 磁盘布局、设备型号差异 |
| 用户/应用 | 文档、窗口、游戏… | application programs | OS 内部策略 |

**Device-driver interface**：上层用统一接口，下层 **drivers for specific hardware devices** —— 典型 “抽象接口 + 具体实现”。

**Process** 本身也是抽象：把 “program in execution + resources + PC” 收成一个 **unit of work**，程序员不必直接 multiplex CPU。

#### 抽象与 Sharing / Isolation 如何配合

| 目的 | Abstraction 起的作用 |
|------|----------------------|
| 支持 Sharing | 提供统一的“申请/使用资源”接口（system call），由 OS 在内部做 multiplexing |
| 支持 Isolation | 用户只能通过抽象接口碰资源，不能绕过边界直接操作硬件或其他进程内存 |
| 支持 Interaction | 文件、终端、进程通信等抽象让用户与程序能协作（课件 **Interaction**） |

#### 与 Performance 的权衡

- 抽象常引入额外层（buffering、caching、spooling、系统调用陷入等）→ 可能影响 **performance**。  
- 课件同时把 **Performance** 列为 basic requirement：抽象要方便，但不能无节制地牺牲效率；**caching** 等机制正是在抽象层下“偷偷”优化。  
- 好的 OS 设计：对外 **convenient**（abstraction），对内 **efficient**（sharing + 实现优化）。

```diagram
flow
physical media / devices（各异 · peculiarities）
→ Abstraction：file · directories · device-driver interface · process
→ 用户只面对 logical view（convenient）
→ OS 内部仍做 sharing + isolation + caching 等
```

### 7.4 三者关系与对照总表

| | **Sharing / multiplexing** | **Isolation** | **Abstraction** |
|--|----------------------------|---------------|-----------------|
| 问的问题 | 如何让多方用有限资源？ | 如何防止互害与失控？ | 如何让人好用、好写程序？ |
| 关键词 | resource allocator, CPU utilization, scheduling | protection, dual-mode, privileged, timer | intermediary, hide peculiarities, file |
| 若缺失 | 资源闲置或无法多用户 | 崩溃、篡改、死循环占机 | 人人直接操作硬件，无法移植与协作 |

**串起来**：先用 **abstraction** 定义“进程/文件/设备长什么样”；再用 **isolation** 保证各抽象实例有边界；最后在边界内用 **sharing / multiplexing** 把物理资源高效分出去。课件其余目的可挂接：**Interaction**（在抽象接口上协作）、**Security**（强化 isolation 的策略）、**Performance**（在抽象下把 multiplexing 做快）。

## 附录 · 课件仅列标题或未展开

仅备查（Chapter ONE 大纲后半 / 图示页）：

- Protection and Security · Distributed Systems · Special-Purpose Systems · Computing Environments（课件 Outlines 有题、正文未展开）  
- Interrupt Timeline / Interrupt-Driven I/O Cycle / Device-Status Table / Memory Layout for Multiprogrammed System（多为示意图）  
- Slide：RISC-V Registers 与 **CSR**（Control & Status Registers）— 实验对照  
- 非本 PPT 主线、他处常见的补充切分（如 trap/fault/abort 返回行为；maskable/NMI）勿与课件 trap 定义混淆  
