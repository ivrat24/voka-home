---
title: 操作系统真题库
date: 2026-09-15
description: 手写回忆卷 + 论坛期末回忆整理；含补全、答案与简要解析
source: 课堂/考试回忆（含缺损补全）；CC 仅作学习存档
---

# 操作系统真题库

> 整理说明：综合多份回忆（手写草稿 + 论坛帖）。缺损选项已按常考题型补全并标注「〔补〕」；答案为学习参考，**非正式标准答案**。

---

# 卷一 · 手写回忆选择题

## 1. 下面哪个不需要硬件支持？

- A. process scheduling  
- B. clock management  
- C. address resolution  
- D. interrupt  

**答案：A**  
**解析：** 时钟、地址变换（MMU）、中断均需硬件；进程调度主要是软件策略（虽可配合定时器中断）。

## 2. thread share the

- A. stack  
- B. register value  
- C. global variable  
- D. thread ID  

**答案：C**  
**解析：** 同进程线程共享代码、全局/堆等；栈、寄存器、线程 ID 各自私有。

## 3. 下面的程序造了几个子进程？

```c
if (fork())
    printf(...);
fork();
execve(...);   // 〔回忆〕可能在某一分支
```

**答案（按常见写法）：视完整代码而定；若为「两次 fork、无提前 exit」则最多 3 个子进程（共 4 个进程）。**  
**解析：** 第一次 `fork` 产生 1 个子进程；父子再各 `fork` 又各增 1，共 3 个子进程。若某处 `execve` 成功替换映像，不影响已创建的进程个数统计（创建发生在 `fork`）。

## 4. 下面哪个可缓解 thrashing（抖动）？

- A. TLB  
- B. decrease concurrency（降低并发/多道程度）  
- C. fast cache  
- D. fast disks  

**答案：B**  
**解析：** 抖动因工作集过大、帧不够；降低多道程度是经典手段。TLB/快盘不能从根上消除抖动。

## 5. 什么时候进程从 running → ready？

- A. time slice over  
- B. 〔补〕更高优先级进程到达 / 抢占  
- C. waiting event（去等待某事件）  
- D. waiting event occur（等待事件发生）  

**答案：A（及抢占情形下的 B）**  
**解析：** 时间片到或被抢占 → ready；主动等 I/O → waiting；事件完成 → waiting→ready。

## 6. PCB contain（多选倾向）

- A. process state  
- B. schedule info  
- C. memory management info  
- D. total code segment  

**答案：A、B、C**  
**解析：** PCB 存状态、调度信息、内存管理信息等；**不存完整代码段内容**（代码在地址空间中）。

## 7. 同步代码（flag 初始化 false）

```text
P0: while(flag[1]); flag[0]=true; CS; flag[0]=false; ...
P1: while(flag[0]); flag[1]=true; CS; flag[1]=false; ...
```

- A. mutual exclusion is guaranteed  
- B. enter critical section at the same time is possible  
- C. flag[i] should be initialized to true  
- D. progress is not satisfied  

**答案：B**  
**解析：** 先检查对方 flag 再置己方 true，存在竞态，可能同时进临界区；互斥不保证。这不是正确的 Peterson 算法。

## 8. 20 producer，15 consumer，buffer size = 8，信号量初值？

**答案（典型三信号量）：**  
- `empty = 8`（空槽）  
- `full = 0`（已装产品）  
- `mutex = 1`（互斥）  

生产者/消费者个数一般**不**直接改这三个初值。

## 9. semaphore initial = 5，now = −4，how many processes waiting？

**答案：4**  
**解析：** 计数信号量为负时，绝对值 ≈ 等待队列长度。

## 10. 哪个 true？

- A. process is the basic unit of dispatch while thread not  
- B. thread share stack  
- C. thread is heavier than process  
- D. thread has own scheduling information  

**答案：D**  
**解析：** 现代 OS 中线程常是调度单位，且有自己的调度上下文；线程更轻；不共享栈。

## 11. single page table + demand paging，从主存取数据访问物理内存几次？

- A. 1  B. 2  C. 3  D. 4  

**答案：B（无 TLB 命中时的常见说法）**  
**解析：** 先访存读页表项，再访存读数据 → 2 次。有 TLB 命中可为 1。

## 12. which tech. solve name collisions in file system？

**答案：目录（directory）/ 树形目录 + 路径名（〔补〕）**  
**解析：** 用目录层次与路径区分同名文件。

## 13. segment：seg=2, base=90, length=100；逻辑地址 ⟨2,110⟩ 的物理地址？

**答案：Invalid / 越界**  
**解析：** 偏移 110 ≥ length 100，非法。

## 14. wait(semaphore) assuming：

- A. not multi processor  
- B. atomically  
- C. test-set implementation  
- D. initial is 1  

**答案：B**  
**解析：** P/V 必须原子执行。

## 15. which is impossible？（单 CPU）

- A. 1 running，n−1 waiting  
- B. 1 running，n−1 ready  
- C. 1 running，1 ready，n−2 waiting  
- D. 1 ready，n−1 waiting  

**答案：D**  
**解析：** 有就绪进程却无人 Running（CPU 空闲）不合理（调度器会选一个跑）。

## 16. software synchronization ways

**答案（列举）：** Peterson、TSL/CAS 用户态自旋、信号量、管程、消息传递等〔补〕。

## 17. page 0 → frame 2，逻辑地址 10，页大小 4096

**答案：物理地址 = 2×4096 + 10 = 8202**  
**解析：** `pa = frame×page_size + offset`。

## 18. external fragment caused by

- A. paging  B. demand paging  C. dynamic partition  D. none  

**答案：C**  
**解析：** 动态分区产生外碎片；分页主要是内碎片。

## 19. page fault 过程排序

(1) reset page table valid=1  
(2) swap page to frame  
(3) get empty frame  
(4) look page table：invalid / not in memory  
(5) restart instruction  

**答案：4 → 3 → 2 → 1 → 5**  

## 20. dual-mode 不需要？

- A. user program in kernel  
- B. privileged instruction  
- C. os in kernel  
- D. bit indicate mode  

**答案：A**  
**解析：** 用户程序不应跑在内核态；需要特权指令、内核在核态、模式位。

## 21. which not OS provide？

- A. I/O  B. game engine  C. file system  D. IPC  

**答案：B**  

## 22. 临界区三要素（另给 no busy waiting 作干扰）

**答案：Mutual Exclusion、Progress、Bounded Waiting**  
**解析：** 「无忙等」是实现偏好，不是经典三要素。

## 23. which have Belady anomaly？

- A. LRU  B. NRU  C. FIFO  D. None  

**答案：C**  

## 24. which child will not share with father？

- A. address space（写时复制前逻辑共享映射，但是独立空间）  
- B. process ID  
- C. user ID  
- D. open files  

**答案：B**  
**解析：** 子进程有新 PID；打开文件表等可继承；地址空间写时复制后独立。

## 25. file absolute path is from

- A. current dir  B. root  C. home  D. open files  

**答案：B**  

## 26. in which file structure is directed (direct) access difficult？

- A. contiguous  B. index  C. link（链表）  D. hash  

**答案：C**  
**解析：** 隐式链接分配不利于随机/直接访问。

## 27. address binding can happen in

- A. compile  B. load  C. execution〔补〕  D. all  

**答案：D**  

## 28. `.open()` / `open` 系统调用

- A. read content  B. read file control info  C. read FAT  D. read disk block  

**答案：B（建立打开文件项 / 读 FCB 等控制信息）**  

## 29. CPU 远快于输出设备时用

- A. buffer  B. parallel  C. channel  D. virtual  

**答案：A（缓冲；也可假脱机）**  

## 30. SSTF：磁头在 80，序列 27,136,58,100,72,40，总寻道？

路径一例：80→72→58→40→27→100→136  
距离：8+14+18+13+73+36 = **162**  

（若选其他等距分支，以课堂标准答案为准。）

## 31. 哪些不在内核态执行？（多选组合题）

- A. I/O  B. Read（系统调用 read）  C. sin  

**答案：含 C 的组合**  
**解析：** `sin` 可在用户态库完成；真正 I/O / `read` 需陷入内核。

## 32. 线程不共享？

- A. code  B. file  C. global variable  D. 〔栈 / 寄存器；回忆写 process block queue〕  

**答案：D（私有栈等）**  

## 33. 触发创建新进程？（多选）

- A. user login  B. device allocation  C. new program start  

**答案：A、C（常见）**；单纯设备分配不一定 `fork`。

## 34. 〔遗忘〕

## 35. 两进程对共享 `value` 分别 +1 / −1，初值 10，可能终值？

**答案：可能为 9、10、11（竞态）**  
**解析：** 读写非原子时，更新可能丢失。

## 36. 页表项中没有？

- A. present bit  B. remove bit  C. modified bit  D. frame address  

**答案：B**  

## 37. Windows/UNIX/Linux 对死锁常用？

- A. detection  B. prevention  C. none（忽略 / 鸵鸟）  

**答案：C（多数通用 OS 对应用死锁采取忽略或有限处理）**  
**解析：** 银行家算法等避免策略在通用桌面/服务器并不常用。

## 38. 谁提供统一的 I/O 设备访问方式？

- A. drives  B. kernel  C. bus  D. OS / **device drivers**〔教材表述常为 device drivers〕  

**答案：device drivers（驱动向上提供统一接口）**  

## 39. ext4 属于？

**答案：Linux 本地文件系统（journaling FS）〔补〕**  

## 40. 微内核相对宏内核的优点不包括？

- A. efficient  B. modifiable  C. secure  D. reliable  

**答案：A**  
**解析：** 微内核消息传递开销更大，效率通常不是优点。

## 41. working set〔回忆：给定引用串、时刻、窗口〕

**答案：按定义 \(W(t,\Delta)=\) 最近 \(\Delta\) 次访问的不同页集合〔题目数据缺失，无法出具体集合〕**  

## 42. 引用串 `1213415321413214`，比较 FIFO / LRU / OPT

**答案：需给定帧数后分别模拟缺页次数〔帧数回忆缺失〕**  

## 43. 二级页表：10 + 10 + 12 位

**答案要点：**  
- 页大小 \(2^{12}=4\)KB  
- 逻辑地址 32 位  
- 页表项数等按「每级 10 位索引」计算  

## 44. 读写缓冲同步（互斥写、可读共享，容量 M）〔填空〕

**答案骨架：** `mutex`；`empty=M`；`full=0`；读者计数 + 读写锁/信号量变种〔具体空需原卷〕  

## 45. inode 最大文件；目录项大小求可容纳文件数〔数据缺失〕

**答案：按 direct/indirect 块数 × 块大小；目录大小 / 目录项大小〔补〕**  

## 46. 线程调度 / 周转时间〔第二问遗忘〕

**答案：按到达与突发时间画甘特图求 turnaround〔数据不完整〕**  

---

# 卷二 · 另一份回忆（选择题精选）

## Q1 线程共享？

stack / heap / global / register → **heap、global**（不共享 stack、register）

## Q2 关于进程描述错误

「进程是指令和栈的集合」→ **错误表述（应含代码、数据、PCB/资源等）**

## Q3 不可能的状态转换

Ready→Running / Running→Ready / Running→Waiting / **Waiting→Running（不可能，须经 Ready）**

## Q4 CPU 70%，disk 5%，提高整体利用率

**加载更多 I/O 型进程 / 提高多道程度（在合理范围）** —— 让 CPU 在 disk 空闲时有活干。  
（若 CPU 很低、disk 极高，则应减多道、加 CPU 型——见卷三对照题。）

## Q5 context-switch 不含？

register / **global variable** / stack / memory（相关）→ 切换主要换寄存器与内核栈等，**不切换全局变量所属（同地址空间概念不同）**；选 **global variable**。

## Q6 fork 次数

```c
if (fork()) printf("%d", getpid());
fork();
return 0;
```

**子进程数：3**（进程总数 4）

## Q7 可抢占资源

中断？ **CPU** 可抢占；打印机、消息通常视为不可抢占或需谨慎。→ **CPU**

## Q8 用户级线程为何快

**无需内核陷入做线程切换；切换在用户库完成，开销小。**

## Q9 many-to-one：一线程阻塞

**B. 整个进程阻塞**（因一个内核线程绑定）

## Q10 何时不需启动 CPU 调度器

例如：**新进程创建后仍不抢占且当前进程未让出**；或中断返回后仍跑原进程等〔依选项〕。常见：仅修改优先级但未触发抢占策略时。

## Q11 就绪 10 进程，时间片 200ms，切换 10ms，开销比

每片有效 200，切换 10 → \(10/(200+10)\approx 4.8\%\) → **约 5%（B）**

## Q12 周转时间

**周转时间 = 等待时间 + 运行时间**（对单 CPU 非 I/O 简化模型）

## Q14 信号量协调 5 进程、3 同类资源，不应出现的值？

S 范围大约 \([-2,3]\)（最多 2 个等待若只有… 实际：最多 5−3=2 个等待时 S=−2；**−3 不应出现（D）**）

## Q15 计数信号量：28P+18V 后 S=0，再 3V，等待数？

先由 28P、18V、S=0 反推初值；再 3V 后 S=3>0 → **等待 0 个**

## Q16 Banker’s algorithm

**B. deadlock avoidance**

## Q19 逻辑地址最大值由

**计算机体系结构 / 地址总线宽度（及程序可用地址空间设计）**

## Q20 MMU 非必须？

**段表不是必须**（纯分页系统无段表）；页表机制 + 可选 TLB。

## Q21 Best Fit，55MB：+15,+30,−15,+8,+6，最大空闲？

演练：空→[15][30][10]；释 15→[15空][30][10]；Best Fit 8→占 10 中 8 剩 2，或占 15 剩 7；再 6…  
常见答案回忆为 **9MB 或 10MB**，按逐步模拟：  
释 15 后空闲 15 与 10；8 进 10 剩 2；6 进 15 剩 9 → **最大空闲 9MB（B）**

## Q23 共享数据

**分段更自然支持共享段；分页也可共享页。** 常选 **分段**。

## Q24 ⟨2,260⟩，段长导致

若 length 允许：物理 = base+260；回忆答案 **480K+260**（以卷面段表为准）。

## Q28 OPT 缺点

**需要预知未来，不可能真正实现**

## Q30 FCB 在哪个调用建立？

**A. create**

## Q31 二级索引，块 2KB，地址 4B，最大文件

每块地址数 \(2048/4=512\)；二级：\(512\times512\times2\)KB = **512MB**（若仅二级、无直接块）

## Q32 在第 45 块后插入，最慢？

**A. contiguous**（可能大量搬移）

## Q35 引导程序在

**D. ROM**

## Q37 臂运动方向可随时改变？

**SSTF**

## Q40 字符设备不是？

**A. 磁盘**（块设备）

## Q41 向 I/O 子系统提供统一设备访问接口？

**Device drivers**

## Q42 Linux 把 I/O 设备当作？

**D. special files**

## Q43 不经 CPU 的 I/O？

**DMA**

## Q45 8 pages × 1024，32 frames

逻辑：\(3+10=13\) bit；物理：\(5+10=15\) bit → **D**

## Q47 缺页上界

**最多 p 次**（串长 p；每引用都可能 fault）；更紧上界与算法有关，一般上界 **p**。

## Q48 假脱机

**采用虚拟设备概念** — 正确

---

# 卷三 · 期末英文卷回忆（2025-01 帖）

## 单选（摘录）

| 题 | 答案 | 要点 |
|----|------|------|
| 1 not OS component | **A Bootloader** | 引导程序通常不算 OS 运行时组件 |
| 3 UNIX is | **A time-sharing** | |
| 5 waiting→ready | **B I/O completes** | |
| 7 process scheduling is | **D CPU** | |
| 8 context switch | **B** 切换正在执行的进程 | |
| 9 preemption | **A**（常见）或 D 若含退出/IO 后调度 | 时间片到最典型 |
| 10 用户级/单线程内核上线程阻塞 | **B 整个进程阻塞** | |
| 11 context switch key | **C PC and stack** | |
| 12 wake up means | **B → ready** | |
| 13 system call | **D OS 提供的接口** | |
| 14 →kernel：/0 与 read；sin 否 | **C I and III** | |
| 15 race condition | **B data section** | |
| 17 信号量题 | 初值 10，28 wait+18 signal→S=0；再 3 wait → **C 3 waiting** | \(10-28+18=0\)，再 3 次 wait → S=−3，等待 3 |
| 18 Banker's used by | **D None** | 通用 OS 基本不用 |
| 20 speed address translate | **B I and II** | TLB 增大；页表常驻可降缺页式页表访问（表述依课） |
| 22 VA 0x11123456，页 4KB，页号 | **D 0x11123** | 右移 12 位 |
| 24 page fault by | **B MMU** | 硬件检出 |
| 25 logical address | **C used by CPU** | |
| 26 no internal frag | **B Segmentation** | 纯分段无内碎片（外碎片有） |
| 27 OPT，4 frames，串给定 | 模拟得 **B 7**（请自行复核甘特） | |
| 29 VM paging 不要求 | **C 装入连续物理区** | |
| 30 bad for dynamic growth | **A contiguous** | |
| 32 access manner | **C both OK** | |
| 33 disk buffer in | **B memory** | |
| 35 disk time includes | **A seek time** | |
| 38 page fault order | **4→3→2→1→5** | |
| 最灵活调度 | **B Multilevel Feedback Queue** | |
| Spinlocks | **B often used in MP** | |
| CPU 13% Disk 99% | **B decrease MPL 或 C more CPU-bound** | 磁盘饱和应减 I/O 型 |

## 填空

41. process = **resource**（资源）unit；thread = **scheduling/CPU**（调度）unit  
42. share **data/heap**, **files/open files**；not share **stack**（及寄存器）  
43. running → **ready / waiting(blocked) / terminated**  
44. syscall number → **syscall table**；fd → **open file table**（进程打开文件表）

## 大题 1 调度

| P | AT | BT | Pri |
|---|----|----|-----|
| 1 | 0 | 9 | 1 |
| 2 | 2 | 3 | 2 |
| 3 | 4 | 5 | 0 |
| 4 | 6 | 3 | 3 |

**A.** 分别画 FCFS、抢占 SJF、抢占 Priority（数字小优先）甘特图。  
**B.** 对各算法求平均等待时间、平均周转时间。  

（请按标准模拟；FCFS 顺序 P1–P2–P3–P4。）

## 大题 2 信号量填空

初值全 0：

```text
# P1
print("P1")
signal(P1_done)          #1

# P2
wait(P1_done)            #2
print("P2")
signal(P2_done)          #3

# P3
wait(P1_done)            #4  〔若只需 P1∧P2，可用两次 wait 或拆信号量〕
wait(P2_done)
print("P3")
signal(P3_done)          #5

# P4
wait(P3_done)            #6
print("P4")
```

若卷面只有 6 个空且 P3 只需一次复合条件，可用两个 done 信号量各 wait 一次占两空。

## 大题 3 Sv39 / fork / COW

- **A.** `fork` 两次：进程总数 **4**（含父），新建子进程 **3**。  
- **B(a)** 按需调页、无预装：第一次计算触及 code/stack/heap 各 1 页 → 约 **3** 次缺页。  
- **B(b)** COW：fork 不立即拷贝页；后续写时再 fault。总数依赖写了多少私有页，需按「每次写私有页算 fault」估算〔卷面细节〕。  
- **C.** VA `0x80000000` → PA `0xa000`；页表物理页 `0x1000/0x2000/0x3000`；叶项 R=0,W=0,X=1,V=1；中间项仅 V，RWX=0。

---

# 卷四 · 随堂测验（Ch2 系统服务 / 系统调用）

> 来源：课堂 Pick Answer（超时未答）；答案为平台标出的 Correct answer，附简要解析。

## Q1 哪类 OS 服务主要保证系统自身高效运行，而非直接服务用户？

Which class of operating system services is specifically designed to ensure the efficient operation of the system itself rather than directly serving the user?

**答案：Resource allocation, accounting, and protection & security**  
**解析：** 面向用户的服务如 UI、程序执行、I/O、文件系统等；**资源分配、记账、保护与安全**属于面向系统自身的服务，保证多用户/多进程下系统高效、可控运行。

## Q2 命令行解释器（shell）的主要功能是什么？

What is the primary function of a command-line interpreter (shell)?

**答案：To fetch the next command statement and execute it**  
**解析：** Shell 从用户/脚本取得下一条命令并执行（可内建或启动新进程）；不是内核本身，而是用户态命令解释器。

## Q3 应用程序员为何通常用 API 而非直接系统调用？

Why do application programmers typically write code using Application Programming Interfaces (APIs) rather than direct system calls?

**答案：APIs provide greater program portability and simpler abstractions across platforms.**  
**解析：** API（如 POSIX / Win32）屏蔽具体 syscall 编号与传参细节，同一套库可跨平台编译；库内部再发起真正的系统调用。

## Q4 系统调用参数超出可用 CPU 寄存器时，常用哪种传参方式？

When system call parameters exceed the capacity of available CPU registers, which method is commonly used to pass parameters to the OS?

**答案：Storing parameters in a memory block/table and passing its pointer in a register.**  
**解析：** 常见三种：寄存器、内存块/表 + 寄存器传指针、压栈。参数多时用**内存表 + 寄存器存地址**最常见。

## Q5 fork() / exec() / exit() / wait() 属于哪类系统调用？

Which category of system calls includes operations such as fork(), exec(), exit(), and wait()?

**答案：Process control**  
**解析：** 进程控制：创建/终止/加载执行/等待等。另有 file / device / information / communication / protection 等类别。

## Q6 系统调用触发后，内核如何找到并执行对应例程？

How does the operating system kernel typically identify and execute the correct kernel routine when a system call is triggered?

**答案：By indexing a system-call dispatch table using a unique system call number**  
**解析：** 用户态放入**系统调用号**；内核用该号索引 **dispatch / system-call table**，跳转到对应内核例程。

## Q7 什么是 system programs（系统程序 / 系统实用程序）？

What defines "system programs" (or system utilities) in an operating system?

**答案：Standalone programs that provide a convenient environment for program development and execution.**  
**解析：** 系统程序是相对独立的实用程序（编译器、文件工具、shell 等），为开发与执行提供方便环境；不同于始终运行的内核，也不同于普通第三方应用。

## Q8 设计上把 mechanism 与 policy 分离的核心好处？

In operating system design, what is the core advantage of separating "mechanism" from "policy"?

**答案：Mechanisms determine how to do something; policies decide what will be done, allowing flexibility.**  
**解析：** **机制**管「怎么做」，**策略**管「做什么/何时做」；分离后可改策略而不必重写机制，系统更灵活。

## Q9 传统单体内核（如早期 UNIX）的特点与潜在缺点？

What is a notable characteristic and potential drawback of the traditional monolithic kernel design (e.g., original UNIX)?

**答案：All kernel components run in a single address space, so a failure in one subsystem can crash the OS.**  
**解析：** 单体内核各子系统同处一个地址空间，性能好，但一处故障易拖垮整个 OS。

## Q10 微内核（如 Mach）的主要设计原则？

What is the primary design principle behind a microkernel architecture (e.g., Mach)?

**答案：Moving as many non-essential components as possible from kernel space into user space.**  
**解析：** 微内核只保留最核心功能，其余（文件、驱动等）尽量放到用户空间，靠消息传递协作，提高隔离与可靠性。

## Q11 现代 OS 如何用 LKM 增强模块化？

How do modern operating systems utilize Loadable Kernel Modules (LKMs) to enhance modularity?

**答案：By allowing the kernel to dynamically link and load drivers or filesystems at runtime without recompiling**  
**解析：** **可加载内核模块**可在运行时动态链接/加载驱动、文件系统等，无需重新编译整个内核。

---

# 计算题补遗（回忆）

1. **段页式**求物理地址，非法写 Invalid。  
2. 自定义信号量 `monophore` 写 `lock/unlock`。  
3. Linux 混合索引 inode：12 direct + indirect + triply；块 512B；indirect 含 128 指针。  
   - 最大文件 ≈ \(12 + 128 + 128^3\) 块 × 512B（无二级时按卷面结构）。  

---

# 附录 · 使用建议

1. 优先核对课上 PPT / 实验（Lab3–5 与期末相关）。  
2. 带「〔补〕/数据缺失」的题以课堂原卷为准。  
3. 同源参考笔记：[NoughtQ OS](https://note.noughtq.top/sys/os)（`materials/raw_src_nt_N.md`）。
