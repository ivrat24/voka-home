---
title: ch1-Sets, Relations and Languages
date: 2026-09-15
tags: [计算理论, Ch1, 集合, 关系, 语言]
description: 集合与运算、关系与函数、有限/无限集、归纳与对角化、闭包算法、字母表与语言
---

# ch1-Sets, Relations and Languages

> Chapter 1 核心知识整理（逻辑化重排；公式按站点 KaTeX 规范书写）

## 1. Sets（集合）

### 1.1 基本概念

| 概念 | 说明 |
|------|------|
| **集合** | 无重复元素；**顺序不重要** |
| **元素 / 成员** | 属于集合的对象，记 \(a \in A\) |
| **单元集**（singleton） | 恰含 1 个元素的集合，如 \(\{a\}\) |
| **空集** | \(\emptyset\)，不含任何元素 |
| **子集** | \(A \subseteq B\)：\(A\) 的每个元素都属于 \(B\) |
| **真子集**（proper subset） | \(A \subset B\)：\(A \subseteq B\) 且 \(A \neq B\) |

**集合相等**：\(A = B\) 当且仅当 \(A \subseteq B\) 且 \(B \subseteq A\)。

```diagram
flow
元素 a, b, c（无序、不重复）
组成集合 A = {a, b, c}
子集 B ⊆ A（如 {a, c}）
真子集：B ⊆ A 且 B ≠ A
```

### 1.2 集合运算

对集合族 \(S\)：

\[
\bigcup S = \{ x : x \in P \text{ for some } P \in S \}
\]

\[
\bigcap S = \{ x : x \in P \text{ for each } P \in S \}
\]

- **差**（difference）：\(A - B = \{ x : x \in A \text{ and } x \notin B \}\)
- **不相交**（disjoint）：\(A \cap B = \emptyset\)

```diagram
flow
A ∪ B：属于 A 或属于 B（或都属）
A ∩ B：同时属于 A 与 B
A − B：属 A 但不属 B
不相交：A ∩ B = ∅
```

### 1.3 代数性质

| 性质 | 公式 |
|------|------|
| **幂等**（idempotency） | \(A \cup A = A\)，\(A \cap A = A\) |
| **交换**（commutativity） | \(A \cup B = B \cup A\)，\(A \cap B = B \cap A\) |
| **结合**（associativity） | \((A \cup B) \cup C = A \cup (B \cup C)\)（交同理） |
| **分配**（distributivity） | \((A \cup B) \cap C = (A \cap C) \cup (B \cap C)\)；\((A \cap B) \cup C = (A \cup C) \cap (B \cup C)\) |
| **吸收**（absorption） | \((A \cup B) \cap A = A\)，\((A \cap B) \cup A = A\) |
| **德摩根**（De Morgan） | \(A - (B \cup C) = (A - B) \cap (A - C)\)；\(A - (B \cap C) = (A - B) \cup (A - C)\) |

当 \(A = U\)（全集）时，德摩根律常写成更熟悉的 \(\overline{B \cup C} = \overline{B} \cap \overline{C}\) 等形式。

### 1.4 幂集与划分

- **幂集**（power set）：\(A\) 的全部子集构成的集合，记作 \(2^A\)。
- **划分**（partition）：幂集的子集 \(\Pi \subseteq 2^A\)，并满足下列三条：
  1. \(\emptyset \notin \Pi\)
  2. 任意两块互不相交
  3. \(\bigcup \Pi = A\)

例：\(A = \{1,2,3\}\) 时，幂集含 \(2^3 = 8\) 个子集；一种划分如 \(\{\{1\},\{2,3\}\}\)。

```diagram
tree
A = {1, 2, 3}
空集
单元素子集
二元子集
全集 A
```

```diagram
flow
划分块 P1（非空）
与 P2 互不相交
与 P3 互不相交
并集 = 原集合 A
```

---

## 2. Relations and Functions（关系与函数）

### 2.1 有序对与笛卡尔积

**有序对**（ordered pair / pair）记作 \((a, b)\)：

- \(a\)、\(b\) 为其**分量**（component）；顺序重要，且允许 \(a = b\)。
- 与无序集合 \(\{a, b\}\) 不同：\(\{a, b\} = \{b, a\}\)，但一般 \((a, b) \neq (b, a)\)（当 \(a \neq b\)）。

**有序对相等**（pair equality）：

\[
(a, b) = (c, d) \iff a = c \text{ 且 } b = d.
\]

**有序对的逆**（pair inverse）：对调两个分量，

\[
(a, b)^{-1} := (b, a).
\]

显然 \(\big((a, b)^{-1}\big)^{-1} = (a, b)\)；且 \((a, b) = (b, a)\) 当且仅当 \(a = b\)。

```diagram
flow
有序对 (a, b)
pair 逆：对调分量
得到 (b, a)
再逆一次 → 回到 (a, b)
```

```diagram
flow
集合 {a, b}：无序，{a,b}={b,a}
有序对 (a, b)：有序，一般 (a,b)≠(b,a)
相等判定：对应分量分别相等
```

- **笛卡尔积**：\(A \times B = \{ (a, b) : a \in A,\ b \in B \}\)。
- **有序 n 元组** \((a_1, \ldots, a_n)\)；未固定 \(n\) 时也称**序列**（sequence）。相等同样要求各对应分量相等。
- **n 重笛卡尔积**：\(A_1 \times \cdots \times A_n\)。

### 2.2 关系

- **二元关系**：\(R \subseteq A \times B\)（有序对的集合）。
- **n 元关系**：\(R \subseteq A_1 \times \cdots \times A_n\)。
- 1 / 2 / 3 元分别称 unary / binary / ternary relation。

关系的逆由「逐对取逆」得到：

\[
R^{-1} = \{ (a, b)^{-1} : (a, b) \in R \} = \{ (b, a) : (a, b) \in R \} \subseteq B \times A.
\]

图上即把每条有向边反向。关系之逆**总是**关系。

```diagram
flow
R 中的每条边 (x → y)
对每个 pair 取逆
变成边 (y → x)
全体组成 R⁻¹
```

### 2.3 函数与各类映射

从 \(A\) 到 \(B\) 的**函数**（function / mapping）\(f\) 是特殊的二元关系 \(f \subseteq A \times B\)：对每个 \(a \in A\)，**有且仅有**一个有序对以 \(a\) 为第一分量。记 \(f : A \to B\)。

| 术语 | 记号 / 含义 |
|------|-------------|
| 域（domain） | \(A\) |
| 像 | \(f(a)\)；对 \(A' \subseteq A\)，\(f[A'] = \{ f(a) : a \in A' \}\) |
| 值域 / 范围（range） | \(f[A]\) |
| 多元函数 | \(f : A_1 \times \cdots \times A_n \to B\)，\(a_1,\ldots,a_n\) 为**参数**（arguments），\(b = f(a_1,\ldots,a_n)\) 为**值** |

#### 按「每个定义域元素对应几个像」看关系形态

| 类型 | 含义 | 是否函数 |
|------|------|----------|
| **一对一**（one-to-one） | 不同 \(a\) 对应不同像；每个像至多来自一个 \(a\) | 若全域唯一赋值，即**单射函数** |
| **多对一**（many-to-one） | 多个不同 \(a\) 可映到同一像 | 可以是函数，但**非单射** |
| **一对多**（one-to-many） | 同一 \(a\) 对应多个 \(b\) | **不是**函数 |
| **多对多**（many-to-many） | 两边都可一对多 | **不是**函数 |

> 函数要求：左侧每个元素恰好连出一条边（不多不少）。一对多 / 多对多破坏「恰好一个」。

```diagram
flow
一对一：a1→b1，a2→b2，a3→b3（不撞车，是函数）
多对一：a1,a2→b1，a3→b2（是函数，非单射）
一对多：a1→b1 且 a1→b2（不是函数）
多对多：两侧都可分叉（不是函数）
```

#### 按单射 / 满射分类（对函数 \(f : A \to B\)）

| 类型 | 英文 | 条件 | 直觉 |
|------|------|------|------|
| **单射** | injective / one-to-one | \(a \neq a' \Rightarrow f(a) \neq f(a')\) | 不撞车；可左逆 |
| **满射** | surjective / onto | \(f[A] = B\)（\(B\) 每个元素都是某像） | 盖满值域；可右逆 |
| **双射** | bijective / one-to-one correspondence | 既单射又满射 | 一一对应；存在反函数 |
| **既非单又非满** | — | 有撞车且 \(B\) 有漏网之鱼 | 多对一且未盖满 |

```diagram
flow
单射：不撞车（像互异）
满射：盖满 B（每个 b 都有原像）
双射 = 单射 + 满射 → 存在反函数 f⁻¹
非单非满：既撞车又漏网
```

关系小结：

\[
\text{双射} \;\Rightarrow\; \text{单射},\quad
\text{双射} \;\Rightarrow\; \text{满射};\quad
\text{单射} \nRightarrow \text{满射},\quad
\text{满射} \nRightarrow \text{单射}.
\]

#### 函数之逆何时仍是函数

对函数 \(f\)，先作为关系取逆：\(f^{-1} = \{ (f(a), a) : a \in A \}\)。

- \(f^{-1}\) **总是**关系，但**不一定**是函数。
- \(f^{-1}\) 是函数 \(\iff\) \(f\) 为**双射**（此时称**反函数**）。
- 此时有序对层面：\((a, f(a))^{-1} = (f(a), a)\)，且

\[
f^{-1}(f(a)) = a\ (\forall a \in A),\quad
f(f^{-1}(b)) = b\ (\forall b \in B).
\]

| \(f\) 类型 | \(f^{-1}\) 是否函数 | 原因（pair 视角） |
|------------|---------------------|-------------------|
| 仅单射、非满射 | 否（定义域不够） | 有的 \(b \in B\) 从未作为第二分量出现 |
| 仅满射、非单射 | 否（一对多） | 同一 \(b\) 可对应多个 \(a\)，逆后变成一对多 |
| 双射 | 是 | 每个 \(b\) 恰对应一个 \(a\) |
| 非单非满 | 否 | 以上两种问题兼有 |

```diagram
flow
f 中的 pair (a, f(a))
取 pair 逆 → (f(a), a)
全体组成关系 f⁻¹
仅当 f 双射时，f⁻¹ 才是函数（反函数）
```

---

## 3. Special Types of Binary Relations（特殊二元关系）

把 \(R \subseteq A \times A\) 看成**有向图**：元素为结点，\((a, b) \in R\) 为从 \(a\) 到 \(b\) 的边；\((a,a)\) 为**自环**。

### 3.1 基本性质总表

| 性质 | 英文 | 定义 | 图直觉 |
|------|------|------|--------|
| **自反** | reflexive | \(\forall a \in A,\ (a,a)\in R\) | 每个点都有自环 |
| **反自反** | irreflexive | \(\forall a \in A,\ (a,a)\notin R\) | 完全没有自环 |
| **对称** | symmetric | \((a,b)\in R \Rightarrow (b,a)\in R\) | 有边必有反向边 |
| **反对称** | antisymmetric | \((a,b)\in R\) 且 \((b,a)\in R\) \(\Rightarrow\) \(a=b\) | 异点之间不能双向都有边 |
| **非对称** | asymmetric | \((a,b)\in R \Rightarrow (b,a)\notin R\) | 更强：有边则绝无回流（也排除自环） |
| **传递** | transitive | \((a,b),(b,c)\in R \Rightarrow (a,c)\in R\) | 两步可达则须有直达边 |

> **反对称 vs 非对称**：反对称允许自环，且「双向都有边」只在 \(a=b\) 时合法；非对称禁止任何双向（含自环）。严格序 \(<\) 常是非对称+传递；非严格序 \(\le\) 常是自反+反对称+传递（偏序）。

无自环的**对称**关系可用**无向图**表示（把 \(a\!\leftrightarrow\! b\) 画成一条无向边）。

### 3.2 逐条展开

#### 自反（reflexive）

- 定义：\(A\) 中**每个**元素都与自身相关。
- 判定：检查是否 \(\{(a,a):a\in A\} \subseteq R\)（对角线是否整条落入 \(R\)）。
- 例子：\(\le\) 在 \(\mathbb{Z}\) 上自反；\(=\) 自反；真子集关系 \(\subset\) **不**自反。
- 反例：\(R=\{(1,2)\}\) 在 \(A=\{1,2\}\) 上不自反（缺 \((1,1),(2,2)\)）。

```diagram
flow
自反：每个点都有自环 (a,a)
对称：有 a→b 则必须有 b→a
反对称：异点不可双向（自环可以）
传递：有 a→b 与 b→c 则必须有 a→c
```

#### 反自反（irreflexive）

- 定义：任何元素都**不**与自身相关（无自环）。
- 例子：真子集 \(\subset\)、严格小于 \(<\)。
- 注意：反自反 \(\neq\)「不自反」。不自反只需缺某一个自环；反自反要求**全部**自环都不在。

#### 对称（symmetric）

- 定义：有 \((a,b)\) 就必须有 \((b,a)\)（\(a=b\) 时自动满足）。
- 与逆的关系：\(R\) 对称 \(\iff R = R^{-1}\)。
- 例子：「同学关系」、无向图的边集、模 \(n\) 同余。
- 反例：\(R=\{(a,b)\}\) 有 \(a\to b\) 却无 \(b\to a\)。

#### 反对称（antisymmetric）

- 定义：若 \(a\) 与 \(b\)「互相相关」，则只能是同一个元素。
- 允许：大量单方向边；允许全部自环。
- 禁止：异点之间的双向边 \(a\to b\) 与 \(b\to a\) 同时存在。
- 例子：\(\le\)、整除关系 \(\mid\)（在正整数上）、集合的 \(\subseteq\)。

#### 非对称（asymmetric）

- 定义：有 \((a,b)\) 则必无 \((b,a)\)（令 \(a=b\) 可知也无自环）。
- 关系：非对称 \(\Rightarrow\) 反自反 + 反对称；反之不必然一步到位，但严格序常见组合是非对称+传递。
- 例子：\( < \)、真子集 \(\subset\)。

#### 传递（transitive）

- 定义：从 \(a\) 经一步到 \(b\)、再一步到 \(c\)，则必须有 \(a\) 直达 \(c\)。
- 等价说法：若存在长度 \(\ge 3\) 的路径（按结点计），则路径两端也须直接相关；更干净的说法是——\(R\circ R \subseteq R\)（关系复合）。
- 例子：\(\le\)、\(=\)、整除、可达关系。
- 反例：\(a\to b\to c\) 却无 \(a\to c\)。

### 3.3 性质之间的关系与常见组合

```diagram
flow
自反：对角线全在
对称：R = R 的逆
反对称：异点不能双向
传递：两步蕴含一步
组合成等价关系或偏序
```

| 组合 | 名称 | 典型例子 |
|------|------|----------|
| 自反 + 对称 + 传递 | **等价关系** | \(=\)、模 \(n\) 同余、等势 \(\sim\) |
| 自反 + 反对称 + 传递 | **偏序**（partial order） | \(\le\)、\(\subseteq\)、整除 |
| 偏序 + 任意两元可比 | **全序**（total / linear order） | \(\le\) 在 \(\mathbb{R}\) 上 |
| 非对称 + 传递 | **严格偏序**（常见） | \(<\)、\(\subset\) |
| 对称 + 传递（未必自反） | 部分教材称 partial equivalence | 慎用；考试以等价/偏序为主 |

**易混点**

1. **对称与反对称可以同时成立**：例如恒等关系 \(R=\{(a,a):a\in A\}\)（只有自环）。异点之间既无正向也无反向边，两条定义都满足。
2. **对称与非对称几乎不相容**：若存在 \(a\neq b\) 的边，二者冲突；若 \(R\) 为空或仅可能……实际上非对称禁止自环，而对称+有自环也不行——故非空非对称关系一定不对称。
3. **自反与反自反**：在 \(A\neq\emptyset\) 时互斥。
4. **传递不蕴涵自反**：空关系在非空 \(A\) 上传递且对称，但不自反。

**由逆表达**

- 对称 \(\iff R=R^{-1}\)
- 反对称 \(\iff R\cap R^{-1}\subseteq \{(a,a):a\in A\}\)
- 非对称 \(\iff R\cap R^{-1}=\emptyset\)

### 3.4 闭包视角（与 §6 衔接）

给任意 \(R\)，可生成「最小的」具有某性质的超关系：

| 闭包 | 含义 | 做法直觉 |
|------|------|----------|
| **自反闭包** | 最小自反超集 | 补上全部自环：\(R\cup\{(a,a)\}\) |
| **对称闭包** | 最小对称超集 | 补上所有反向边：\(R\cup R^{-1}\) |
| **传递闭包** | 最小传递超集 | 补上一切「多步可达」的直达边 |
| **自反传递闭包** \(R^{*}\) | 最小自反且传递的超集 | 有向可达（含到自身）；见 §6 |

```diagram
flow
原关系 R
加自环 → 自反闭包
并上 R 逆 → 对称闭包
补可达边 → 传递闭包
自反+传递 → R*
```

### 3.5 等价关系与等价类

同时满足**自反、对称、传递** \(\Rightarrow\) **等价关系**（equivalence relation）。  
无向图视角下，连通块即为**等价类**（equivalence classes）。

记含 \(a\) 的等价类为

\[
[a] = \{ b : (a, b) \in R \}.
\]

（因对称，\((b, a) \in R\) 不必再写。）

要点：

- \(a\,R\,b \iff [a]=[b]\)
- 不同等价类不相交；全部等价类之并等于 \(A\)
- **商集** \(A/R = \{[a]:a\in A\}\)

**定理**：非空集合 \(A\) 上的等价关系 \(R\)，其等价类构成 \(A\) 的一个划分。  
反之，\(A\) 的任一划分也唯一对应一个等价关系（「落在同一块内」）。

```diagram
flow
等价关系 = 自反 + 对称 + 传递
导出等价类
各类互不相交且并起来 = A
形成划分；划分也可反推等价关系
```

### 3.6 偏序与全序

#### 定义

同时满足**自反、反对称、传递**的二元关系 \(R\subseteq A\times A\) 称为 **偏序**（partial order）。  
常记 \(a\le b\) 表示 \((a,b)\in R\)，并把有序对 \((A,\le)\) 称为**偏序集**（poset）。

由非严格偏序可诱导**严格偏序**（strict partial order）：

\[
a < b \;\iff\; a\le b \text{ 且 } a\neq b.
\]

\( < \) 通常满足**非对称 + 传递**（因而也反自反）。

```diagram
flow
偏序 ≤：自反 + 反对称 + 传递
严格序 <：a≤b 且 a≠b（非对称 + 传递）
全序：偏序 + 任意两元可比
```

#### 可比与不可比

| 概念 | 定义 |
|------|------|
| **可比**（comparable） | \(a\le b\) 或 \(b\le a\)（至少一个成立） |
| **不可比**（incomparable） | 两者都不成立 |

- **偏序**：允许存在不可比的元素对（故名「偏」）。
- **全序 / 线序**（total order / linear order）：偏序，且任意 \(a,b\in A\) 都可比。

#### 极值元

以下定义均相对于偏序集 \((A,\le)\)。

| 概念 | 英文 | 定义 | 直觉 |
|------|------|------|------|
| **极小元** | minimal | \(\nexists\, b\in A\) 使 \(b<a\)；即 \(b\le a\Rightarrow b=a\) | 没有「严格更小」；**可有多个** |
| **极大元** | maximal | \(\nexists\, b\in A\) 使 \(a<b\)；即 \(a\le b\Rightarrow a=b\) | 没有「严格更大」；**可有多个** |
| **最小元** | minimum / **least** | \(\forall x\in A,\ a\le x\) | **全局**最小；**至多一个** |
| **最大元** | maximum / greatest | \(\forall x\in A,\ x\le a\) | **全局**最大；**至多一个** |

#### least（最小）vs minimal（极小）——核心区别

两者都在说「小」，但量化范围不同：

| | **least / 最小元** \(a\) | **minimal / 极小元** \(a\) |
|--|-------------------------|---------------------------|
| 逻辑 | \(\forall x,\ a\le x\) | \(\nexists x,\ x<a\)（没有人严格比它小） |
| 要求 | 必须与**每一个**元素可比，且都 \(\le\) 它 | 只禁止存在更小者；可以和某些元素**不可比** |
| 个数 | 有则**唯一** | 可以**多个**并列 |
| 蕴含 | least \(\Rightarrow\) minimal | minimal **\(\nRightarrow\)** least |

对偶地：**greatest（最大）vs maximal（极大）** 完全对称——把 \(\le\) 反过来即可。

**一句话：**  
minimal =「下面没人了」（局部底）；least =「我在所有人下面」（全局底）。

```diagram
flow
least：对所有 x 都有 a ≤ x（全局）
minimal：不存在 x < a（局部）
least ⇒ minimal
多个 minimal 并存时 ⇒ 没有 least
```

**反例（有极小、无最小）：**  
取 \(A=\{2,3,4,6\}\)，偏序为整除 \(\mid\)。

- \(2\mid 4,\ 2\mid 6,\ 3\mid 6\)；\(2\) 与 \(3\) **不可比**。
- **极小元**：\(2\) 与 \(3\)（没有 \(A\) 中元素严格整除它们）。
- **最小元**：不存在（没有任何元素同时整除 \(2\) 和 \(3\)）。
- **极大元**：\(4\) 与 \(6\)；同样**无最大元**。

**正例（二者重合）：**  
在全序 \((\mathbb{N},\le)\) 中，\(0\)（或按习惯从 \(1\) 起则 \(1\)）既是 least 也是（唯一）minimal——全序里「极小 = 最小」「极大 = 最大」。

教材表述对照：  
「仅当 \(a=b\) 时 \((b,a)\in R\)」\(\iff\) 「没有严格更小的 \(b\)」\(\iff\) **minimal（极小）**，不是 least。

其他要点：

1. 有限非空偏序集**一定有** minimal / maximal（沿链下行/上行必停），但**不必有** least / greatest。
2. 若 least 存在，则它是**唯一**的 minimal；若 greatest 存在，则它是**唯一**的 maximal。

#### Hasse 图直觉（覆盖关系）

若 \(a<b\) 且不存在 \(c\) 使 \(a<c<b\)，称 \(b\) **覆盖**（cover）\(a\)。  
**Hasse 图**：只画覆盖边，省略自环与可由传递推出的边；习惯上「小的在下、大的在上」。

```diagram
flow
例：bottom 被 x、y 覆盖
x、y 都被 top 覆盖
x 与 y 不可比（偏序典型特征）
```

#### 典型例子

| 偏序集 | 是否全序 | 说明 |
|--------|----------|------|
| \((\mathbb{Z},\le)\)、\((\mathbb{R},\le)\) | 是 | 数的通常大小 |
| \((2^{S},\subseteq)\) | 否（\(\lvert S\rvert\ge 2\)） | \(\emptyset\) 最小，\(S\) 最大；单元素集彼此常不可比 |
| \((\mathbb{N}^{+},\mid)\)（整除） | 否 | \(1\) 最小；素数两两不可比；无最大元 |
| 字典序下的有限串集合（同长或按约定） | 视定义 | 常可做成全序 |

#### 与等价关系对照

| | 等价关系 | 偏序 |
|--|----------|------|
| 自反 | ✓ | ✓ |
| 对称 / 反对称 | **对称** | **反对称** |
| 传递 | ✓ | ✓ |
| 图直觉 | 无向连通块（等价类） | 有向无环的「分层」结构（Hasse） |
| 导出结构 | 划分 / 商集 | 极值元、链/反链、全序扩张等 |

> **链**（chain）：两两可比的子集（诱导全序）。**反链**（antichain）：两两不可比的子集。

### 3.7 路径与环

- **路径**：序列 \((a_1, \ldots, a_n)\)（\(n \ge 1\)），满足 \((a_i, a_{i+1}) \in R\)。路径长度取 \(n\)（结点个数，教材约定）。
- **环**（cycle）：路径还满足 \((a_n, a_1) \in R\)。

与传递/闭包的联系：传递闭包里 \((a,b)\in R^{+}\)（或 \(R^{*}\)）当且仅当存在从 \(a\) 到 \(b\) 的路径（\(R^{*}\) 允许长度为 1 的平凡路径）。

```diagram
flow
路径：a1 → a2 → a3 → a4
若再有 a4 → a1，则成为环
传递闭包：凡多步可达都补成直达边
```

---

## 4. Finite and Infinite Sets（有限与无限）

### 4.1 等势

存在双射 \(f : A \to B\) 时称 \(A, B\) **等势**（equinumerous），记 \(A \sim B\)。

\(\sim\) 是等价关系：

1. **自反**：恒等映射 \(\mathrm{Id}_A\) 为双射 \(\Rightarrow A \sim A\)
2. **对称**：\(f\) 双射 \(\Rightarrow f^{-1}\) 双射
3. **传递**：双射可复合，\(g \circ f\) 仍双射

```diagram
flow
A ∼ B：存在双射 f : A → B
B ∼ C：存在双射 g : B → C
复合 g ∘ f : A → C 仍双射
故 A ∼ C（传递）
```

### 4.2 有限、可数、不可数

| 概念 | 定义 |
|------|------|
| **有限**（finite） | 存在 \(n \in \mathbb{N}\)，使 \(A \sim \{1, 2, \ldots, n\}\)；基数 \(\lvert A \rvert = n\) |
| **无限**（infinite） | 非有限；注意：无限集不必两两等势 |
| **可数无限**（countably infinite） | \(A \sim \mathbb{N}\) |
| **可数**（countable） | 有限或可数无限 |
| **不可数**（uncountable） | 非可数 |

```diagram
flow
有限：可与 {1..n} 双射
可数无限：可与 N 双射（可枚举完）
可数 = 有限 ∪ 可数无限
不可数：如 2^N（对角化）
```

**定理（可数性四等价）**：下列命题等价：

1. \(A\) 可数；
2. \(A\) **有限，或**存在双射 \(f : A \to \mathbb{N}\)；
3. 存在单射 \(g : A \to \mathbb{N}\)；
4. 存在满射 \(h : \mathbb{N} \to A\)（通常默认 \(A \neq \emptyset\)）。

#### 真题练习（2023–2024 · 判断）

**题目：** The set of all numerical functions is uncountable, but the set of all \(\mu\)-recursive functions is countable.

**答案：** 正确。

**解答：**

- 「全体数值函数」可理解为 \(\mathbb{N}\to\mathbb{N}\)（或等价地与 \(2^{\mathbb{N}}\) / \(\mathcal{P}(\mathbb{N})\) 等势的对象），由对角化知**不可数**。
- \(\mu\)-递归函数与「可用图灵机计算的函数」同一档：每台 TM 可编码为有限串，故全体 TM **可数**，因而 \(\mu\)-递归函数集**可数**。
- 结论：前者不可数、后者可数，命题成立。（「\(\mu\)-递归 / TM」细节见后续章节，本处只用到 §4–§5 的可数性。）

---

## 5. Three Fundamental Proof Techniques（三种基本证明技法）

### 5.1 数学归纳法（mathematical induction）

令 \(A \subseteq \mathbb{N}\) 满足：

1. \(0 \in A\)
2. 若 \(\{0, 1, \ldots, n\} \subseteq A\)，则 \(n + 1 \in A\)

则 \(A = \mathbb{N}\)。（可用反证法证明）

**证「对任意自然数 n，P(n) 为真」的模板**：令 \(A = \{ n : P(n) \text{ 成立} \}\)。

1. **基础步骤**：证 \(P(0)\)
2. **归纳假设**：对固定但任意的 \(n \ge 0\)，\(P(0),\ldots,P(n)\) 皆真
3. **归纳步骤**：由假设推出 \(P(n+1)\)

```diagram
flow
基础步骤：证明 P(0)
归纳假设：P(0)…P(n) 皆真
归纳步骤：推出 P(n+1)
结论：对所有自然数 n，P(n) 成立
```

### 5.2 鸽巢原理（pigeonhole principle）

若 \(A, B\) 有限且 \(\lvert A \rvert > \lvert B \rvert\)，则任意 \(A \to B\) 的映射**不是单射**。

通俗：鸽子多于鸽巢 \(\Rightarrow\) 至少一巢有两只以上鸽子。

```diagram
flow
3 只鸽子要进 2 个巢
无论怎么分配
至少有一个巢不少于 2 只
```

可用归纳法证明（对 \(\lvert B \rvert\) 归纳）：

- 基：\(\lvert B \rvert = 0\)
- 假设：\(\lvert B \rvert \le n\) 成立
- 步骤：推 \(\lvert B \rvert = n + 1\)

**定理**：\(R\) 为有限集 \(A\) 上二元关系，\(a, b \in A\)。若存在 \(a\) 到 \(b\) 的路径，则必存在长度至多为 \(\lvert A \rvert\) 的路径。

> 思路：过长路径必重复结点（鸽巢），可删去环得到更短路径。

```diagram
flow
过长路径：结点数大于 card(A)
由鸽巢：必有重复结点
删去中间环得到更短路径
反复缩短直到长度不超过 card(A)
```

### 5.3 对角化（diagonalization）

设 \(R \subseteq A \times A\)，对角集合

\[
D = \{ a \in A : (a, a) \notin R \}.
\]

对每个 \(a \in A\)，令 \(R_a = \{ b \in A : (a, b) \in R \}\)。则 \(D\) 与每一个 \(R_a\) 都不同。

```diagram
flow
关系 R 看成「行」Ra
构造对角集合 D：在对角上与 Ra 处处不同
故 D ≠ 任何一个 Ra
推出 2^N 不可数
```

**定理**：幂集 \(2^{\mathbb{N}}\) 不可数。（对角化标准应用）

> 与真题呼应：若把「数值函数」编码成 \(\mathbb{N}\) 的子集 / 特征序列，则「全体数值函数不可数」正是本定理的同族结论；见 §4.2 真题练习。

---

## 6. Closures and Algorithms（闭包与算法）

### 6.1 自反传递闭包

对有向图 \(R \subseteq A \times A\)，**自反传递闭包**

\[
R^{*} = \{ (a, b) : a, b \in A,\ R \text{ 中存在从 } a \text{ 到 } b \text{ 的路径} \}.
\]

（含长度为 1 的平凡路径，故自反。）

> 回顾 §3：自反闭包 = 补自环；对称闭包 = \(R\cup R^{-1}\)；传递闭包 = 补可达边；此处 \(R^{*}\) 是**自反传递闭包**。

```diagram
flow
原图：a→b→c
R*：补上全部自环
并补上 a→c（传递可达）
结果：凡有路径可达的对都在 R* 中
```

```diagram
flow
朴素：枚举所有长度≤n 路径 → O(n^(n+1))
改进：反复补传递边 → O(n^5)
Warshall：按中间点 j 扫描 → O(n^3)
```

### 6.2 朴素算法：枚举所有路径 —— \(O(n^{n+1})\)

设 \(A = \{ a_1, \ldots, a_n \}\)。

```text
Initially R* = emptyset
for i = 1, ..., n do
    for each i-tuple (b[1], ..., b[i]) in A^i do
        if (b[1], ..., b[i]) is a path in R then
            add (b[1], b[i]) to R*
```

估计：检验长度 \(\le n\) 的所有序列，每次至多 \(O(n)\) 次边查询 / 插入，总步数

\[
\le n \cdot (1 + n + n^2 + \cdots + n^n) \in O(n^{n+1}).
\]

指数级，极慢。

### 6.3 改进：反复补传递边 —— \(O(n^5)\)

```text
# reflexive
Initially R* = R ∪ {(a[i], a[i]) : a[i] ∈ A}
# transitive
while ∃ a[i], a[j], a[k] ∈ A such that
    (a[i], a[j]), (a[j], a[k]) ∈ R* but (a[i], a[k]) ∉ R* do
        add (a[i], a[k]) to R*
```

- \(R^{*}\) 至多 \(n^2\) 对 \(\Rightarrow\) 至多 \(n^2\) 次成功加入
- 每次找三元组约 \(O(n^3)\) \(\Rightarrow\) 总复杂度 \(O(n^5)\)
- 从指数降到多项式，但仍重复扫描三元组

### 6.4 Warshall 型：按中间结点排序 —— \(O(n^3)\)

```text
Initially R* = R ∪ {(a[i], a[i]) : a[i] ∈ A}
for each j = 1, 2, ..., n do
    for each i = 1, ..., n and k = 1, ..., n do
        if (a[i], a[j]), (a[j], a[k]) ∈ R* and (a[i], a[k]) ∉ R* then
            add (a[i], a[k]) to R*
```

**正确性要点**（归纳）：外层循环完成第 \(j\) 次后，\(R^{*}\) 包含所有满足「\(R\) 中存在从 \(a_i\) 到 \(a_k\)、中间结点最大下标（rank）\(\le j\)」的有序对。详见教材约 P.37。

### 6.5 增长率与大 \(O\)

对 \(f : \mathbb{N} \to \mathbb{N}\)，

\[
O(f) = \{ g : \mathbb{N} \to \mathbb{N} \mid
\exists\, c, d > 0,\ \forall n,\ g(n) \le c \cdot f(n) + d \}.
\]

若 \(f \in O(g)\) 且 \(g \in O(f)\)，记 \(f \asymp g\)（等价关系）。\(f\) 关于 \(\asymp\) 的等价类即其**增长率**。

### 6.6 一般闭包性质

令 \(R \subseteq D^{n+1}\) 为 \(D\) 上的 \(n+1\) 元关系。子集 \(B \subseteq D\) 在 \(R\) 下**封闭**（closed）：若 \(b_1, \ldots, b_n \in B\) 且 \((b_1, \ldots, b_n, b_{n+1}) \in R\)，则 \(b_{n+1} \in B\)。

形如「在 \(R_1, \ldots, R_m\) 下封闭」的性质称为**闭包性质**。

**定理**：闭包性质 \(P\) 与子集 \(A \subseteq D\) 给定时，存在**唯一最小**集合 \(B \supseteq A\) 且满足 \(P\)。

有限域上可多项式时间计算（泛化 \(O(n^5)\) 思路）：

```text
Initially A* = A
while ∃ i ∈ {1..k} and elements a[j[1]], ..., a[j[r[i]-1]] ∈ A*
      and a[j[r[i]]] ∈ D − A*
      such that (a[j[1]], ..., a[j[r[i]]]) ∈ R[i] do
        add a[j[r[i]]] to A*
```

复杂度 \(O(n^{r+1})\)，其中 \(n = \lvert D \rvert\)，\(r = \max\{ r_1, \ldots, r_k \}\)。

---

## 7. Alphabets and Languages（字母表与语言）

### 7.1 字母表与字符串

| 概念 | 定义 |
|------|------|
| **字母表** \(\Sigma\) | 有限符号集；重要特例：二元字母表 \(\{0, 1\}\) |
| **字符串** | \(\Sigma\) 上有限符号序列；书写时直接相连，如 `0110011` |
| **空串** | \(e\)（无符号） |
| \(\Sigma^{*}\) | \(\Sigma\) 上全部字符串（含 \(e\)） |
| \(\Sigma^{+}\) | \(\Sigma^{*} - \{e\}\) |
| \(\Sigma^{n}\) | 长度恰为 \(n\) 的字符串集合 |
| 长度 \(\lvert w \rvert\) | 序列长度 |

可将 \(w\) 视为函数 \(w : \{1, \ldots, \lvert w \rvert\} \to \Sigma\)；同一符号在不同位置为不同**出现**（occurrence）。

```diagram
flow
字母表 Sigma（有限符号集）
字符串 = Sigma 上有限序列
空串 e；Sigma* 含全部串；Sigma+ 去掉空串
语言 L 是 Sigma* 的子集
```

#### 真题练习（2023–2024 · 判断）

**题目：** Let \(\Sigma = \emptyset\), some language over \(\Sigma\) is not empty.

**答案：** 正确。

**解答：**

- 语言是 \(\Sigma^{*}\) 的任意子集。
- 即使 \(\Sigma=\emptyset\)，仍有空串 \(e\in\Sigma^{*}\)（长度为 0 的唯一字符串）。
- 取 \(L=\{e\}\)，则 \(L\neq\emptyset\)。故「某个在 \(\Sigma\) 上的语言非空」成立。

### 7.2 拼接、子串、幂、反转

**拼接** \(x \circ y\)（常写 \(xy\)）：

\[
\lvert w \rvert = \lvert x \rvert + \lvert y \rvert,\quad
w(j) = x(j)\ (1 \le j \le \lvert x \rvert),\quad
w(\lvert x \rvert + j) = y(j)\ (1 \le j \le \lvert y \rvert).
\]

- \(w \circ e = e \circ w = w\)；拼接满足结合律 \((wx)y = w(xy)\)。
- \(v\) 是 \(w\) 的**子串**：\(\exists x, y,\ w = xvy\)。
  - \(w = xv\) \(\Rightarrow\) \(v\) 为**后缀**（suffix）
  - \(w = vy\) \(\Rightarrow\) \(v\) 为**前缀**（prefix）

```diagram
flow
前缀 v：w = v · y
子串 v：w = x · v · y
后缀 v：w = x · v
拼接：x ∘ y = xy（把 y 接在 x 后）
反转：w^R（符号左右颠倒）
```

**幂**（归纳定义）：

\[
w^{0} = e,\qquad w^{i+1} = w^{i} \circ w\ (i \ge 0).
\]

**反转** \(w^{R}\)（归纳）：

1. \(\lvert w \rvert = 0\) \(\Rightarrow\) \(w^{R} = e\)
2. \(\lvert w \rvert = n + 1 > 0\)，写 \(w = ua\)（\(a \in \Sigma\)），则 \(w^{R} = a\, u^{R}\)

### 7.3 语言及其运算

**语言**：\(\Sigma^{*}\) 的任意子集。\(\Sigma^{*}\)、\(\emptyset\)、\(\Sigma\) 本身都是语言。

无限语言常写成

\[
L = \{ w \in \Sigma^{*} : w \text{ 具有性质 } P \}.
\]

若 \(\Sigma\) 有限，则 \(\Sigma^{*}\) 可数无限：先按长度递增枚举，同长度内按**词典序**（lexicographic order）枚举。

#### 真题练习（2023–2024 · 判断）

**题目：** The set of all regular languages over the alphabet \(\{a,b\}\) is countable.

**答案：** 正确。

**解答（本章可用的可数性论证）：**

- 后文才严格定义「正则语言」；此处只需：每个正则语言都可由某个**正则表达式**生成，而 \(\{a,b\}\) 上的正则表达式是有限字母表上的有限串（含运算符），故正则表达式全体**可数**。
- 可数多个对象各自对应一个语言，映射到「正则语言集合」是满射（或至多可数），因此 \(\{a,b\}\) 上全体正则语言**可数**。
- 等价说法：\(\{L\subseteq\{a,b\}^{*}:L\text{ 正则}\}=\{L(R):R\text{ 是 }\{a,b\}\text{ 上正则表达式}\}\)。

> 更形式的写法：某一字母表上正则表达式集合可数 \(\Rightarrow\) 其所生成语言的集合可数。本论证只依赖 §4 可数性与 §7 的 \(\Sigma^{*}\) 可数，不需要自动机细节。

语言作为集合，可用并、交、差组合；**补** \(\overline{A} = \Sigma^{*} - A\)。

**语言拼接**：

\[
L_1 L_2 = \{ w : w = x \circ y,\ x \in L_1,\ y \in L_2 \}.
\]

**克莱尼星号**（Kleene star）：

\[
L^{*} = \{ w : w = w_1 \circ \cdots \circ w_k,\ k \ge 0,\ w_i \in L \}.
\]

（\(k = 0\) 对应空串 \(e\)。）把字母表看作有限语言时，\(\Sigma^{*}\) 与克莱尼星号一致。

**正闭包**：

\[
L^{+} = L L^{*} = \{ w : w = w_1 \circ \cdots \circ w_k,\ k \ge 1,\ w_i \in L \}.
\]

```diagram
flow
L1 L2：L1 的串拼上 L2 的串
L-star：0 段或多段来自 L 的串拼接（含空串）
L-plus：至少 1 段（等于 L 再拼 L-star）
补语言：全集 Sigma* 减去 L
```

> 注意：即使 \(\Sigma = \emptyset\)，仍有非空语言 \(L = \{ e \}\)。（见 §7.1 真题练习。）

---

## 本章相关真题索引（2023–2024）

| 题号 | 题型 | 落点 | 答案 |
|------|------|------|------|
| 判断 1 | 正则语言全体可数 | §7.3（+ §4 可数性） | 正确 |
| 判断 2 | 空字母表上可有非空语言 | §7.1 | 正确 |
| 判断 7 | 数值函数不可数 / \(\mu\)-递归可数 | §4.2（+ §5.3） | 正确 |

其余判断/选择/大题主要涉及正则、CFL、RE、归约等后续章节知识点，不在此章展开。
