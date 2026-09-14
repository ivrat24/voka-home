---
title: Day1 引言
date: 2026-09-14
tags: [计算机网络, 引言, Day1]
description: 接入网；动态网络传输示意
---

# Day1 引言（Introduction）

## 网络基本功能（Basic Network Functions）

- **信息传递**（Information Transfer）

## 网络区分依据（Basis for Distinguishing Networks）

- 按所提供的**服务**（Service）区分

## 服务区分依据（Basis for Distinguishing Services）

### 性能与能力（Performance & Capability）

- **功能**（Function）
- **延迟**（Delay / Latency）
- **带宽**（Bandwidth）
- **丢失率**（Loss Rate / Packet Loss Rate）

### 结构与接口（Structure & Interface）

- **端结点**（End Node / End System）数目
- **服务接口**（Service Interface）

### 外特性（External Characteristics）

- **可靠性**（Reliability）
- **实时**（Real-time） / **非实时**（Non-real-time）

## 按覆盖范围划分的网络（Networks by Coverage Area）

按地理覆盖范围，常见四类：

| 类型 | 英文 | 典型覆盖范围 | 典型场景 |
|------|------|--------------|----------|
| **个域网** | Personal Area Network（PAN） | 数米～约 10 米 | 手机与耳机、手表、键鼠等短距互联 |
| **局域网** | Local Area Network（LAN） | 房间、楼层、校园、园区（约百米～数公里） | 宿舍网、实验室网、校园网接入侧 |
| **城域网** | Metropolitan Area Network（MAN） | 一座城市或都市圈（约数十公里） | 城域光纤环、市内机构互联 |
| **广域网** | Wide Area Network（WAN） | 跨城市、跨国家乃至全球 | 运营商骨干网、互联网核心 |

### 概念要点（Key Concepts）

- **个域网（PAN）**：以人为中心的短距离网络，设备少、距离近，常见技术如蓝牙（Bluetooth）、近场通信（NFC）等。
- **局域网（LAN）**：同一地点内共享资源与通信，由个人/单位自主建设与管理；常见技术如以太网（Ethernet）、Wi-Fi。
- **城域网（MAN）**：覆盖一城范围，规模介于局域网与广域网之间，常用于连接市内多个局域网。
- **广域网（WAN）**：远距离、大范围互联，通常依赖电信运营商线路与路由设备，是互联网（Internet）的主体形态之一。

### 主要区别（Distinctions）

1. **覆盖范围（Coverage）**：PAN ＜ LAN ＜ MAN ＜ WAN（由近到远）。
2. **归属与管理（Ownership & Management）**：LAN 多为本地自建自管；MAN / WAN 更多由运营商或区域机构提供与运维。
3. **时延与带宽倾向（Latency & Bandwidth）**：一般距离越近，延迟越低、可用带宽越高；WAN 受距离与中继影响更大。
4. **技术与成本（Technology & Cost）**：PAN / LAN 侧重短距高速与易用；MAN / WAN 侧重长距传输、交换与计费/租用链路。

> 说明：上述划分是按**地理范围**的常用分类，与按**服务**、**拓扑**等其他分类维度可同时使用，并不互相排斥。

## 互联网互联结构：ISP、IXP 与 Tier（Internet Interconnection）

互联网（Internet）并非单一网络，而是由众多自治系统（Autonomous System，AS）通过商业与技术关系互联而成。其中最常提到的角色是 **ISP**、**IXP**，以及按层级划分的 **Tier**。

### ISP（Internet Service Provider，互联网服务提供商）

- **定义**：向用户或其他网络提供互联网接入与相关服务的组织（如电信运营商、校园/企业接入商）。
- **典型服务**：接入（Access）、IP 地址分配配合、域名相关支持、专线/VPN、内容加速等。
- **关系直觉**：家庭宽带、手机流量套餐背后，通常都对应某家 ISP。

### IXP（Internet Exchange Point，互联网交换中心 / 交换点）

- **定义**：多方网络在同一地点集中互联、交换流量的设施（物理机房 + 交换设备）。
- **作用**：让多家 ISP / 内容网络在本地直接交换流量，减少绕行上级链路，降低时延与成本。
- **对比**：
  - **经上级 ISP 转接（Transit）**：流量“向上买路走”，通常付费。
  - **在 IXP 对等（Peering）**：双方直接互连交换流量，常按约定结算或免费对等。

### Tier（层级）：Tier-1 / Tier-2 / Tier-3

按在全球互联中的地位与结算关系，ISP 常被粗分为三级（教材常用模型，实际边界会模糊）：

| 层级 | 名称 | 主要特征 |
|------|------|----------|
| **Tier-1** | 顶级 / 一级 ISP | 拥有全球骨干；与其他顶级 ISP **结算无关对等（Settlement-free Peering）**，理论上可不向任何其他 ISP 购买过境（Transit）即可到达全网 |
| **Tier-2** | 区域 / 二级 ISP | 覆盖一国或地区；既可与部分网络对等，也常需向更高层购买 Transit |
| **Tier-3** | 接入 / 三级 ISP | 主要面向终端用户接入；通常向上游购买 Transit，较少参与全球骨干对等 |

### 关键关系（How They Fit Together）

1. **用户 → Tier-3 / 接入 ISP**：家庭、校园、企业先接到本地接入商。
2. **接入 ISP → Tier-2 / Tier-1**：流量经上级转发，或在 **IXP** 与其他网络直接交换。
3. **Tier-1 之间**：通过骨干直连或大型 IXP 完成全球范围可达。

```diagram
flow
用户 / 校园网
接入 ISP（多为 Tier-3）
区域 ISP（Tier-2） · 可经 IXP 对等
顶级 ISP（Tier-1）↔ Tier-1 骨干对等
```

> 旁路：区域 ISP 也可在 **IXP** 与其他 ISP / CDN **Peering（对等）**；向上多为 **Transit（过境）**。

### 易混辨析（Distinctions）

1. **ISP vs IXP**：ISP 是“提供接入与连通的网络运营者”；IXP 是“多方相遇交换流量的场所/设施”。
2. **Peering vs Transit**：对等侧重互惠直连；过境是付费让上游帮你转发到更远的目的地。
3. **Tier 不是严格行政等级**：同一公司在不同区域角色可能不同；CDN、云厂商也会深度参与互联，使边界更复杂。

## 网络边缘与网络核心（Network Edge & Network Core）

从结构上看，互联网常被划分为 **网络边缘（Network Edge）** 与 **网络核心（Network Core）** 两部分。

### 网络边缘（Network Edge）

- **定义**：位于网络“外围”、直接面向用户与应用的一侧；主机在此接入网络，运行各类网络应用。
- **主要组成**：
  - **端系统（End System / Host）**：网络边缘的主体，既是通信的起点也是终点。
  - **接入网（Access Network）**：把端系统连接到边缘路由器（Edge Router）的链路与设备（如家庭宽带、校园接入、蜂窝接入）。
  - **边缘路由器（Edge Router）**：接入网与运营商/校园更大网络之间的分界设备（概念上属于“边缘侧出口”）。

#### 端系统（End System）及其组成

- **端系统**：运行应用程序、产生或消费数据的设备，也称主机（Host）。
- **常见类型**：
  - **客户机（Client）**：主动发起请求的一端（如浏览器所在的电脑、手机）。
  - **服务器（Server）**：提供服务、响应请求的一端（如 Web 服务器、邮件服务器）。
  - 也可同为对等体（Peer），如部分 P2P 应用中的节点。
- **组成（逻辑视角）**：
  1. **应用进程（Application Process）**：浏览器、邮件客户端、视频 App 等，使用网络服务收发数据。
  2. **协议栈（Protocol Stack）**：端系统内的分层协议实现（如应用层 → 传输层 → 网络层 → 链路/物理相关部分），负责分段、寻址、可靠/不可靠传输等。
  3. **网络接口（Network Interface）**：网卡（NIC）、Wi-Fi / 蜂窝模块等，把比特送到接入链路。
  4. **操作系统与套接字（OS & Socket）**：为应用提供编程接口（API），把应用数据交给协议栈。

> 要点：端系统“在边缘思考应用”，通过套接字把消息交给网络；真正在网络中转发分组的工作，主要由网络核心完成。

### 网络核心（Network Core）

- **定义**：由互联的路由器（Router）与通信链路（Link）构成的网状转发基础设施，负责在端系统之间搬运分组（Packet）。
- **主要组成**：
  - **路由器 / 分组交换机（Router / Packet Switch）**：根据目的地址选择下一跳，转发分组。
  - **通信链路（Communication Link）**：光纤、铜缆、无线等物理介质，连接交换机与路由器。
  - **更广意义上还可包含**：运营商骨干、区域汇聚、部分交换中心（IXP）中的互联设施。
- **核心工作方式（概念）**：
  - **分组交换（Packet Switching）**：把数据切成分组，共享链路；相对电路交换更灵活、利用率更高（引言级理解即可）。
  - **存储转发（Store-and-Forward）**：路由器先收完整分组再转发。
  - **路由与转发（Routing & Forwarding）**：路由决定“走哪条路”，转发执行“从哪个口送出”。

### 边缘 vs 核心（Contrast）

| 对比项 | 网络边缘（Edge） | 网络核心（Core） |
|--------|------------------|------------------|
| 主要角色 | 端系统、接入网 | 路由器、骨干/汇聚链路 |
| 关注点 | 应用、用户体验、接入方式 | 连通、转发、容量与路由 |
| 数据角色 | 产生 / 消费数据 | 搬运 / 交换数据 |
| 典型设备 | PC、手机、服务器、家庭网关 | 核心/边缘路由器、光纤干线 |

```diagram
flow
端系统：应用 + 协议栈 + 网卡
接入网（Access）
边缘路由器
网络核心：路由器 ↔ 链路 ↔ 路由器
对端边缘路由器 → 对端接入网 → 对端端系统
```

## 接入网（Access Network）

### 定义与位置（Definition & Position）

- **接入网（Access Network）**：把端系统（家庭、校园、企业、手机等）连接到边缘路由器、进而连入网络核心的那一段网络。
- **在整体中的位置**：

```diagram
flow
端系统（Host）
接入网（Access Network）
边缘路由器 / 接入控制点（如 BRAS）
网络核心 / IP 云
```

- **职责一句话**：解决“最后一公里 / 最后一段”（Last Mile）——用户如何物理与逻辑地“上到网”。

### 基本问题（What Access Must Solve）

1. **物理连接**：用何种介质（铜缆、同轴、光纤、无线）到达用户。
2. **共享还是独享**：链路带宽是专用（Dedicated）还是多用户共享（Shared）。
3. **上线与鉴权**：用户如何认证、获得 IP、受带宽/策略约束（固网常经 BRAS）。
4. **汇聚上联**：众多用户流量如何汇聚后进入城域 IP 网 / 骨干。

### 接入网分类（Types of Access Networks）

#### 1. 家庭接入（Residential Access）

| 方式 | 英文 / 要点 | 介质与特征 |
|------|-------------|------------|
| **拨号接入** | Dial-up | 电话线 + Modem；速率低，基本淘汰（了解即可） |
| **数字用户线** | DSL（Digital Subscriber Line），常见 ADSL/VDSL | 利用电话铜线（双绞线）；上下行常不对称；局端为 DSLAM |
| **同轴 / 有线电视接入** | Cable / HFC（Hybrid Fiber-Coax） | 同轴电缆到户，干线多用光纤；同轴段常多用户共享 |
| **光纤到户** | FTTH（Fiber To The Home） | 光纤直达用户侧；高带宽、主流家宽形态 |
| **光纤到驻地** | FTTP（Fiber To The Premises） | 光纤到用户驻地的总称，常涵盖 FTTH / FTTB 等 |
| **光纤到楼/路边等** | FTTB / FTTC 等 | 光纤到楼/路边，楼内再铜缆或网线延伸 |

##### DSL（Digital Subscriber Line，数字用户线）

- **思路**：在已有电话双绞线上同时传语音与数据（经分离器/滤波器隔离频段）。
- **常见变体**：
  - **ADSL**（Asymmetric DSL）：下行远大于上行，适合浏览/视频。
  - **VDSL / VDSL2**：更高速率，但对线距更敏感。
- **局端设备**：**DSLAM**（Digital Subscriber Line Access Multiplexer）汇聚多路 DSL 用户。
- **局限**：速率随铜线长度与线质下降；长期被光纤家宽替代，但仍是重要概念。

##### 同轴电缆接入（Coaxial Cable / Cable / HFC）

- **同轴电缆（Coaxial Cable）**：中心导体 + 绝缘 + 屏蔽层，抗干扰较好，曾广泛用于有线电视。
- **HFC（Hybrid Fiber-Coax）**：光纤到小区/光节点，再用同轴分配到户。
- **局端概念**：**CMTS**（Cable Modem Termination System）终结用户侧 Cable Modem。
- **特点**：最后一公里同轴段多为**共享介质**，高峰时可能争用带宽。

##### FTTP / FTTH / FTTB（光纤到驻地系列）

- **FTTP（Fiber To The Premises）**：光纤延伸到用户驻地（premises）的统称。
- **FTTH（Fiber To The Home）**：光纤进家，用户侧为 ONT/光猫；属于 FTTP 的典型形态。
- **FTTB（Fiber To The Building）**：光纤到楼，楼内再用网线/铜缆入户。
- **FTTC（Fiber To The Curb/Cabinet）**：光纤到路边/交接箱，余段仍可能走铜线（可与 VDSL 等组合）。
- **实现载体**：多为 **PON**（Passive Optical Network，无源光网络）。

**FTTH / PON 常见结构**

- **OLT**（Optical Line Terminal，光线路终端）：局端设备，面向众多用户光路。
- **ODN**（Optical Distribution Network，光分配网）：光纤 + **光分路器（Splitter）** 等无源设施。
- **ONU / ONT**（Optical Network Unit / Terminal，光网络单元/终端）：用户侧光猫。
- **PON**（Passive Optical Network）：局端到用户侧以无源分光为主，降低有源设备数量。

```diagram
tree
OLT（局端）
ONU/ONT（用户1）
ONU/ONT（用户2）
ONU/ONT（用户…）
```

> 中间经光纤与**光分路器（Splitter）** 构成 ODN；上图为逻辑汇聚关系。

**三类有线接入对照**

| 类型 | 入户介质 | 局端要点 | 共享性直觉 |
|------|----------|----------|------------|
| DSL | 电话双绞线 | DSLAM | 每用户一对线，偏独享（受线距限制） |
| Cable/HFC | 同轴（+光纤干线） | CMTS | 同轴段常共享 |
| FTTH/FTTP | 光纤 | OLT + PON | 分光共享光功率/容量，规划后相对稳定 |

**家庭侧常见设备**

- **调制解调器 / 光猫（Modem / ONT）**：完成接入技术终结（DSL/Cable/光纤）。
- **家庭网关 / 路由器（Home Gateway / Router）**：NAT、DHCP、Wi-Fi、防火墙等。
- **无线接入点（AP，Access Point）**：提供家庭 WLAN（常与路由一体）。

#### 2. 机构 / 园区接入（Enterprise / Campus Access）

- **以太网局域网（Ethernet LAN）**：交换机互联主机，再经边界路由器/防火墙上联 ISP。
- **无线局域网（WLAN / Wi-Fi）**：AP 覆盖办公室、教室；站（Station）经 AP 接入有线网。
- **特点**：本地自建自管为主；出口再经专线、以太网专线或运营商接入进入 Internet。

#### 3. 无线广域 / 移动接入（Wireless Wide-Area / Cellular Access）

- **蜂窝移动网接入**：经 **RAN（无线接入网）** 进核心网，再进 IP 网络。
- **代际概念**：2G/3G/4G/5G 空口与网元名称不同，但“终端 → 无线接入 → 核心网 → Internet”结构一致。
- **公共 Wi-Fi 热点**：机场、商场等 WLAN，背后仍落到有线接入与运营商/机构出口。

#### 4. 其他接入形态（Other）

- **专线接入（Leased Line）**：企业点对点或到 ISP 的固定带宽链路。
- **卫星接入（Satellite）**：高时延，覆盖偏远地区。
- **电力线载波等**：了解即可，非课程主干。

### 有线接入 vs 无线接入（Wired vs Wireless）

| 对比 | 有线接入（Wired） | 无线接入（Wireless） |
|------|-------------------|----------------------|
| 典型 | DSL、Cable、FTTH、以太网 | Wi-Fi、蜂窝（RAN） |
| 优点 | 稳定、易做高带宽与低干扰 | 移动性好、部署灵活 |
| 约束 | 需布线、位置固定 | 易受干扰、共享介质、覆盖与切换问题 |

### 共享与独享、速率相关概念（Sharing & Rate）

- **独享带宽（Dedicated）**：逻辑/物理上该用户可用容量相对独立（如部分专线、PON 中经分光后的光路容量仍受规划约束）。
- **共享带宽（Shared）**：多用户争用同一段介质（如 HFC 同轴段、Wi-Fi 信道、蜂窝小区资源）。
- **接入速率（Access Rate）**：用户侧标称上下行速率；受套餐、线路质量、共享拥塞影响。
- **不对称接入（Asymmetric）**：如下行 > 上行（ADSL、许多家宽套餐），契合浏览/视频类业务。

### 物理介质速览（Physical Media in Access）

| 介质 | 英文 | 接入中的典型用途 |
|------|------|------------------|
| 双绞线 | Twisted Pair | 电话线（DSL）、楼内网线（Ethernet） |
| 同轴电缆 | Coaxial Cable | 有线电视 / HFC |
| 光纤 | Optical Fiber | FTTH、局端中继、RAN 回传 |
| 无线信道 | Wireless Channel | Wi-Fi、蜂窝空口、卫星 |

### 接入过程（逻辑步骤，固网示意）

1. 终端经家庭网关连到 ONU/光猫或 Modem。  
2. 接入汇聚（如 OLT）把多用户流量集中。  
3. **BRAS**（或等价设备）完成认证、授权、地址与策略。  
4. 流量进入 **IP 云 / 城域网**，再到达 Internet 或其他业务网。

移动侧则把步骤 1–2 替换为：**UE → RAN → 核心网网关（GW）**，再进入 IP 网络。

### 接入网与边缘、核心的关系（Fit in the Big Picture）

| 层次 | 主要对象 |
|------|----------|
| 网络边缘 | 端系统 + **接入网** + 边缘侧出口 |
| 接入控制 / 边界 | BRAS、各类 GW、边缘路由器 |
| 网络核心 | 路由器网状互联、运营商 IP 云与骨干 |

> 接入网属于**网络边缘**的组成部分；BRAS/部分 GW 常被视为接入与核心之间的**控制与分界点**。

## 运营商接入侧常见网元：RAN、GW、BRAS、IP 云（Access-Side Elements）

在运营商（ISP）网络中，用户经接入侧设备进入更大的 **IP 网络**。下列缩写在教材与工程材料中常见，需先掌握**定义与职责边界**（可与上一节对照）。

### RAN（Radio Access Network，无线接入网）

- **定义**：移动通信中，位于用户终端（UE）与核心网之间的无线侧网络，负责无线空口接入与无线资源相关处理。
- **典型组成**：基站（Base Station，如 4G 的 eNB、5G 的 gNB）、无线控制器/集中单元（因代际而异）、回传/前传链路等。
- **作用**：完成终端的无线接入、无线信道调度、与核心网之间的用户面/控制面衔接（概念层）。
- **边界**：RAN 侧重“无线怎么接进来”；真正的会话管理、移动性管理等多在核心网（Core Network）侧。
- **归属**：RAN 是**无线形态的接入网**。

### GW（Gateway，网关）

- **定义**：连接不同网络、不同协议或不同管理域的网间互连设备/功能实体，在边界上完成转换、转发或策略控制。
- **为什么需要**：两侧可能协议不同、地址体系不同、或归属不同运营商/企业网，需要“门口翻译官”。
- **常见类型（按场景）**：
  - **家庭网关 / 用户侧网关（Home Gateway / CPE）**：家庭光猫/路由器，连接家庭 LAN 与运营商接入。
  - **接入网关 / 边缘网关**：接入网与上层 IP 网络之间的汇聚出口。
  - **核心网网关（Core Gateway）**：如移动核心网中的数据网关（历史名如 GGSN / P-GW，5G 中对应 UPF 等用户面功能，名称随代际变化）。
  - **应用层网关 / 协议网关**：在更高层做协议转换（如部分语音/物联网场景）。
- **要点**：GW 是**角色名**，不是单一固定产品型号；看到 “××GW” 要结合它所夹在哪两个网络之间理解。

### BRAS（Broadband Remote Access Server，宽带远程接入服务器）

- **定义**：固网宽带接入中的关键控制设备，位于用户接入汇聚之后、进入运营商 IP 城域/骨干之前，对宽带用户进行认证、授权、计费与策略控制（常合称 AAA 相关能力）。
- **核心功能**：
  1. **用户接入终结**：终结 PPPoE / IPoE 等接入会话（因运营商方案而异）。
  2. **认证与授权（Authentication & Authorization）**：校验账号套餐，下发带宽、VLAN、ACL 等策略。
  3. **地址与会话管理**：为用户分配/关联公网或私网 IP，维护在线会话。
  4. **计费与管控（Accounting / Policy）**：流量/时长统计，限速、QoS、家长控制类策略入口之一。
  5. **上联到 IP 网络**：把已“合法上线”的用户流量送入运营商 **IP 云 / 城域 IP 网**。
- **位置直觉**：家庭光猫 → 接入汇聚（如 OLT 等）→ **BRAS** → IP 城域网 / 骨干。
- **易混**：BRAS 不是普通二层交换机；它是“宽带用户上线控制点”，偏控制 + 转发边缘。

### 相关接入网元补充（Related Elements）

| 名称 | 英文 | 含义 |
|------|------|------|
| **DSLAM** | Digital Subscriber Line Access Multiplexer | DSL 局端复用/接入设备 |
| **CMTS** | Cable Modem Termination System | 有线电缆侧局端终结设备 |
| **OLT** | Optical Line Terminal | 光纤接入局端 |
| **ONU/ONT** | Optical Network Unit/Terminal | 光纤接入用户侧 |
| **CPE** | Customer Premises Equipment | 用户驻地设备（光猫、家宽路由等） |
| **AP** | Access Point | 无线局域网接入点 |
| **UE** | User Equipment | 用户终端（手机等） |
| **AAA** | Authentication, Authorization, Accounting | 认证、授权、计费 |

### IP 云（IP Cloud / IP Metropolitan-Core Fabric）

- **定义（运营商标述）**：运营商内部以 IP/MPLS 等技术构成的、可路由转发的大范围 IP 网络区域，常形象称为 **IP 云**；用户经 BRAS/GW 进入后，在“云”内按目的地址路由到互联网、IDC、其他城域或业务平台。
- **包含什么（概念上）**：城域核心路由器、汇聚路由器、相关链路，以及通向骨干网、对等点（IXP）、内容网络的出口。
- **为什么叫“云”**：对接入侧而言，内部具体拓扑被抽象成一片可达的 IP 转发域——“进了云，就能按 IP 找到路”。
- **与网络核心的关系**：IP 云属于运营商视角下的 **网络核心/城域核心** 实现形态；教材中的 Network Core 与工程上的 IP 云是同一大类思想的不同表述粒度。
- **注意**：IP 云通常**不属于接入网本身**，而是接入完成之后进入的上层转发域。

### 串联关系（How They Connect）

**移动侧（示意）**

```diagram
flow
手机（UE）
RAN（无线接入网：基站等）
核心网侧 GW / 用户面网关
运营商 IP 网络（IP 云 / 骨干）
Internet
```

**固网宽带侧（示意）**

```diagram
flow
电脑 / 家庭路由器
家庭网关（光猫等）
接入汇聚（如 OLT）
BRAS（认证上线、策略）
IP 云（城域/骨干 IP 转发）
Internet / 业务平台
```

### 概念对照（Quick Distinctions）

| 名称 | 全称要点 | 一句话职责 |
|------|----------|------------|
| **接入网** | Access Network | 端系统到网络边缘出口的“上到网”路径 |
| **RAN** | Radio Access Network | 无线形态的接入网 |
| **GW** | Gateway | 不同网络/协议之间的边界转换与互连 |
| **BRAS** | Broadband Remote Access Server | 固网宽带用户认证上线与策略控制点 |
| **OLT/ONU** | 光线路终端 / 光网络单元 | FTTH/PON 的局端与用户侧 |
| **IP 云** | IP Cloud（城域/核心 IP 网） | 接入之后的运营商 IP 转发域（偏核心侧） |

> 说明：具体设备名称随厂商与 4G/5G、固网改造方案会变化，考试与笔记优先抓住**功能定义与在拓扑中的位置**。

## 附录：动态网络图（局部接入 / 全局网络 + 传输动画）

风格参考「昨日重现」Internet Map。**默认折叠**，点击标题展开；展开后可切换：

- **局部接入**：一条接入路径上的节点与报文传输（如 Host→ONT→OLT→BRAS）
- **全局网络**：**大规模互联网拓扑**（IX / Tier-1·2 / stub AS / 端系统点），不是「用户→接入→城域→骨干」的层次梯子图；可拖拽平移与滚轮缩放

```network
title=接入与互联网示意
id=cn-access-internet
default=local
collapsed=true

[local]
Host|端系统|host
ONT|光猫/ONT|cpe
OLT|OLT|access
BRAS|BRAS|edge
Host>ONT
ONT>OLT
OLT>BRAS
focus: ONT,OLT

[global]
preset=internet
Campus|校园/用户侧|host
BRAS|BRAS|edge
CDN|内容源|peer
```

**写法要点**

1. 元数据：`title=` / `id=` / `default=local|global` / `collapsed=true|false`（默认折叠）
2. 分区：`[local]` 局部接入路径；`[global]` 全局大规模示意
3. 全局：`preset=internet`（默认）生成 IX/骨干/末梢网状拓扑；节点列表仅作**故事标注**钉在 IX 附近，勿再写层次梯子
4. 局部节点：`id|显示名|角色`（`host` / `cpe` / `access` / `edge` / `core` / `peer`）
5. 边：`A>B`；`focus: id1,id2` 局部高亮
