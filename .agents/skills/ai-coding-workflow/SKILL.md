---
name: ai-coding-workflow
description: 完整的软件开发工作流 skill。用户输入文本需求后，自动生成规格文档(spec)、生成执行计划(plan)、逐步执行计划(每步git commit)、运行测试，通过后询问是否推送到远程。触发词：生成功能、开发功能、实现需求、写代码、创建模块、spec、plan、软件开发工作流
---

# AI Coding Workflow

自动化软件开发工作流，将用户需求转化为可执行的、有版本追踪的开发过程。

## 核心理念

这条 skill 的目的是把一次模糊的用户需求，**一步步变成可追溯、可验证、可交付的代码变更**。每一次开发都留下清晰的轨迹——需求是什么（spec），打算怎么做（plan），实际怎么做的（commit history），结果对不对（test）。

**不要在用户还没说完需求时就跳到代码实现。** 先理解清楚需求，让 spec 和 plan 都经过用户确认，再开始写代码。这是最重要的一条原则。

## Skill 目录结构

`ai-coding-workflow` 遵循标准 Codex skill 目录格式：

```
ai-coding-workflow/
├── .agents/
│   └── skills/
│       └── ai-coding-workflow/        # (必须) 本 skill 的独立文件夹
│           ├── SKILL.md                # (必须) 技能核心入口，包含描述和触发词
│           ├── agents/
│           │   └── openai.yaml         # (必须) Codex 接口配置
│           ├── references/             # (可选) 参考文档，供按需加载
│           │   ├── review-spec.md
│           │   ├── review-plan.md
│           │   └── review-exec.md
│           ├── scripts/                # (可选) 辅助脚本
│           └── assets/                 # (可选) 模板、图片等资源
├── docs/
│   ├── PRD.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── agents.md
├── README.md
└── package.json
```

### 各文件/目录职责

| 路径 | 说明 |
|------|------|
| `.agents/skills/ai-coding-workflow/SKILL.md` | skill 入口，由 Codex 加载执行。包含技能名称、描述、触发条件、完整工作流步骤 |
| `.agents/skills/ai-coding-workflow/references/` | 参考文档，校验角色在生成 spec/plan 时可按需加载（P0/P1/P2 审查标准） |
| `.agents/skills/ai-coding-workflow/scripts/` | 辅助脚本，如 git 操作封装、文件生成模板处理等 |
| `.agents/skills/ai-coding-workflow/assets/` | 静态资源，如 spec/plan 模板文件、示例代码片段 |

## 工作流总览

```
用户需求(文本) → 初始化 → 生成 Spec(via校验循环) → 用户确认 → 生成 Plan(via校验循环) → 用户确认 → 执行 Plan(每步commit+测试) → 验收 → 询问是否推送
```

## 目录规则

### 1. 运行时目录（.ai-coding/）

本工作流在工作过程中会产生以下运行时状态文件（与 skill 源文件分开管理）：

```
.ai-coding/
├── temp/           # 存放本次需求缓存（工作完成后移到 history）
│   └── {vId}/
│       ├── state.json              # 状态文件
│       ├── spec.md                # 规格文档
│       └── plan.md                # 执行计划
└── history/        # 存放历史生成记录
    └── {vId}/      # 验收通过后从 temp 移入
        ├── state.json
        ├── spec.md
        └── plan.md
```

> **建议**：将 `.ai-coding/temp/` 添加到项目的 `.gitignore` 中（运行时状态如 `state.json` 包含时间戳、路径等本地信息，不应提交），而 `.ai-coding/history/` 可以根据需要选择性提交以保留开发记录。

### 2. Skill 源文件目录（.agents/skills/ai-coding-workflow/）

本 skill 的源代码遵循标准 skill 仓库格式，位于 `.agents/skills/ai-coding-workflow/` 目录下：

| 路径 | 必选/可选 | 说明 |
|------|-----------|------|
| `.agents/skills/ai-coding-workflow/SKILL.md` | **必选** | 技能核心入口，包含完整的工作流定义 |
| `.agents/skills/ai-coding-workflow/agents/openai.yaml` | **必选** | Codex 接口配置 |
| `.agents/skills/ai-coding-workflow/references/` | 可选 | 参考文档，供校验角色按需加载 |
| `.agents/skills/ai-coding-workflow/scripts/` | 可选 | 辅助脚本（.py、.sh、.js 等） |
| `.agents/skills/ai-coding-workflow/assets/` | 可选 | 模板、图片等静态资源 |
| `docs/` | 可选 | 产品文档（PRD、开发计划、代理指引） |

## 初始化信息生成

在每次工作流启动时，自动生成以下信息并写入状态文件：

| 字段 | 说明 | 生成规则 |
|------|------|---------|
| `name` | 需求名称 | 将本次的用户需求总结为**不超过10个字的中文描述** |
| `shortId` | 唯一标识 | 生成一个**10位随机字母（大小写敏感）**，如 `aBcDeFgHiJ` |
| `vId` | 需求ID | `{name}_{shortId}`，例如 `登录功能_aBcDeFgHiJ` |

### state.json 结构

```json
{
  "vId": "登录功能_aBcDeFgHiJ",
  "name": "登录功能",
  "shortId": "aBcDeFgHiJ",
  "step": 2,
  "status": "initialized",
  "createdAt": "2026-07-29T10:00:00.000Z",
  "updatedAt": "2026-07-29T10:00:00.000Z",
  "specPath": ".ai-coding/temp/登录功能_aBcDeFgHiJ/spec.md",
  "planPath": ".ai-coding/temp/登录功能_aBcDeFgHiJ/plan.md",
  "currentStep": null,
  "waitingFor": null,
  "plan": {
    "allowedPaths": []
  }
}
```

> `waitingFor`：可选字段，等待用户输入时标记等待状态（如 `"user_supplement"`），值为 `null` 表示不在等待状态。配合中断恢复使用：恢复时检查此字段，跳转到对应的补充输入环节。

`plan.allowedPaths` 在 plan 确认通过时写入（详见 Step 4.4），记录本次开发允许修改/新增的所有文件和目录路径，用于 Step 5 执行时的文件范围校验。

### 状态流转

`status` 字段记录当前所处阶段，流转顺序为：

```
initialized → spec_reviewing → spec_confirming → plan_reviewing → plan_confirming → executing → acceptance → accepted → completed
```

每次状态变更时同步更新 `updatedAt`。

> 在"补充信息"场景中，`status` 保持当前阶段不变，同时设置 `waitingFor: "user_supplement"` 标记等待用户输入。中断恢复时需检查此字段来判断是否需要回到补充信息环节。

## 命名规则

运行时文件名固定，不携带 name/shortId 前缀：

| 文件 | 运行时文件名 | 路径 |
|------|-------------|------|
| 规格文档 | `spec.md` | `.ai-coding/temp/{vId}/spec.md` |
| 执行计划 | `plan.md` | `.ai-coding/temp/{vId}/plan.md` |

## 交互要点

- **进度展示**：在每个阶段开始时，清晰告知用户当前阶段和进度
- **选项编号统一**：所有用户选择界面使用 `1. 2. 3. 4. 5.` 数字序号格式，保持一致性
- **确认节点**：spec 确认、plan 确认、推送确认三个节点必须等用户明确回复
- **错误透明**：出错了告知用户错误信息和你的分析，不要默默重试
- **适度灵活**：用户可能在过程中提出修改需求，回到对应环节重新调整
- **角色命名**：各阶段角色职责不同，使用 `spec-generator` / `spec-reviewer` / `plan-generator` / `plan-reviewer` / `execution` 区分，每次循环启动新实例
- **角色协作**：spec 和 plan 的生成均交给独立角色处理，主流程只负责启动角色、接收报告、与用户交互确认。角色与主流程通过校验建议文件（`spec-suggest.md` / `plan-suggest.md`）协作——reviewer 输出结构化建议，主流程读取并判断是否有实质性问题，然后驱动下一轮生成或退出。角色之间不直接交互，所有通信通过主流程协调
- **中断恢复**：每次启动时检查 `.ai-coding/temp/` 中是否有未完成的状态文件，询问用户是否继续
- **分支安全**：执行前检查当前分支，保护分支上询问是否创建功能分支

## 运行流程（详细）

### Step 1：需求输入

用户以文本形式输入需求。你应当：

1. **复述需求**：用自己的话向用户确认你理解的需求
2. **澄清模糊点**：如果需求中有不明确的地方，向用户提问
3. **确认范围**：明确这个需求要做什么、不做什么

确认完成后进入 Step 2。

### Step 2：初始化

执行以下操作：

1. 创建目录 `.ai-coding/temp/`（如果不存在）
2. 创建目录 `.ai-coding/history/`（如果不存在）
3. 生成 `name`（需求总结，≤10字中文）、`shortId`（10位随机字母）、`vId`（`{name}_{shortId}`）
4. 创建目录 `.ai-coding/temp/{vId}/`
5. 写入 `.ai-coding/temp/{vId}/state.json`，`status` 设为 `"initialized"`
6. 告知用户初始化完成，显示 `vId`

### Step 3：Spec 生成

spec 生成阶段由**两个独立角色**协作完成（注意：每次循环都启动新的角色实例，角色名仅描述职责）：

- **spec-generator**：负责初始生成 spec.md，以及根据校验建议修补 spec.md
- **spec-reviewer**：负责校验 spec.md，生成 `spec-suggest.md`（校验建议文件）

主流程充当编排者，驱动"生成 → 校验 → 修补 → 再校验"的循环。

#### 3.1 初始生成（spec-generator）

主流程启动 **spec-generator**，分配以下任务：

**spec-generator 的职责：**

1. 读取项目上下文和用户需求
2. 生成规格文档 `spec.md`，内容应包含：
   - **背景与目标**：为什么要做？成功标准是什么
   - **功能规格**：详细功能描述、输入/输出、边界情况
   - **非功能规格**：性能、安全、兼容性等要求
   - **技术方案**：架构决策、技术选型、依赖关系
   - **文件结构**：预计创建/修改的文件列表
3. 写入 `.ai-coding/temp/{vId}/spec.md`
4. 向主流程报告完成

**报告格式：**

```
spec 生成完成 ✅
路径：.ai-coding/temp/{vId}/spec.md
概要：[2-3 句话总结 spec 核心内容]
主要涉及文件：file1, file2, ...
```

#### 3.2 AI 校验循环（主流程编排）

spec-generator 报告后，主流程启动校验循环，驱动 **spec-reviewer** 和 **spec-generator** 交替工作：

```
循环（最多5轮）：
  1. 主流程启动 spec-reviewer
  2. spec-reviewer 读取 .ai-coding/temp/{vId}/spec.md
  3. spec-reviewer 生成校验建议 → 写入 .ai-coding/temp/{vId}/spec-suggest.md
  4. spec-reviewer 向主流程报告完成
  5. 主流程读取 spec-suggest.md，判断：
     a. 无问题（或仅轻微措辞建议） → 删除 spec-suggest.md，退出循环 ✅
     b. 有实质性问题 → 进入第 6 步
  6. 主流程启动 spec-generator（修补模式），传递 spec-suggest.md 内容
  7. spec-generator 读取 spec-suggest.md，逐条采纳建议并修改 spec.md
  8. spec-generator 向主流程报告修补完成
  9. 主流程删除 spec-suggest.md
  10. 回到第 1 步进行下一轮校验
```

**各角色职责：**

| 角色 | 职责 |
|------|------|
| **spec-reviewer** | 以独立、挑剔视角审视 spec.md，专注于找出遗漏、矛盾、不清晰之处。输出 `spec-suggest.md` 给主流程，不直接修改 spec.md |
| **spec-generator（修补模式）** | 读取 `spec-suggest.md`，逐条评估并采纳合理建议，修改 `spec.md`。不质疑 reviewer 的发现，专注修补 |
| **主流程** | 读取 `spec-suggest.md` 判断是否有实质性问题；驱动循环流程；管理临时文件 |

> - 循环最多 **5 轮**，超过后强制退出
> - spec-reviewer 每次都以"第一次审查"的心态重新审视，不要因为之前提过建议就放行
>
> **审查标准**：spec-reviewer 使用 `references/review-spec.md` 中定义的 P0/P1/P2 分类表和检查重点作为审查标准（详见 [review-spec.md](../references/review-spec.md)）。
>
> **启动 prompt 改造**：启动 spec-reviewer 时，将 `references/review-spec.md` 的以下内容注入 prompt：
> - P0/P1/P2 分类表（用于分类建议）
> - 检查重点清单（用于指导审查方向）
> - 判断标准（用于指导建议的"度"）
>
> **主流程判断"无问题"的标准**：
> - spec-reviewer 输出的建议文件中：
>   - P0 列表为空（无遗漏、无矛盾、方案可行、验收标准可衡量，见 `references/review-spec.md §4`）
>   - P1 列表中无"内容缺失"类的实质性问题，仅含措辞或格式建议

#### 3.3 用户确认

AI 校验循环结束后（无论正常退出还是达到 5 轮上限），主流程向用户展示 spec 关键内容，并提供选项：

```
> 1. 继续
> 2. 重新生成
> 3. 补充信息
> 4. 再次 AI 校验
> 5. 手动修改
```

- **1 继续** → 更新 `state.json`（`status: "spec_confirming"`），进入 Step 4
- **2 重新生成** → 重新进入 3.1（启动 spec-generator 重新生成），并告知用户上一版已被丢弃
- **3 补充信息** → 更新 `state.json` 添加 `waitingFor: "user_supplement"` 字段标记等待状态，提示用户"请直接在对话框中输入需要补充的内容（例如遗漏的功能、修改的需求、新增的约束等）"，用户提供补充信息后清除 `waitingFor` 字段，重新启动 spec-generator（带上补充信息作为额外输入），然后再次进入 3.2 校验循环
- **4 再次 AI 校验** → 重新进入 3.2 校验循环（spec-reviewer 再次审查当前 spec.md），完成后回到此界面
- **5 手动修改** → 告知用户可直接编辑 `.ai-coding/temp/{vId}/spec.md` 文件，修改完成后输入"继续"回到此界面重新选择

用户选择"继续"后，更新 `state.json`：

```json
{
  "status": "spec_confirming",
  "step": 3,
  "updatedAt": "..."
}
```

### Step 4：Plan 生成

plan 生成阶段与 spec 生成阶段采用相同的**双角色协作模式**（同样每次启动新的角色实例）：

- **plan-generator**：负责初始生成 plan.md，以及根据校验建议修补 plan.md
- **plan-reviewer**：负责校验 plan.md，生成 `plan-suggest.md`（校验建议文件）

#### 4.1 初始生成（plan-generator）

主流程启动 **plan-generator**，分配以下任务：

**plan-generator 的职责：**

1. 读取已确认的 `.ai-coding/temp/{vId}/spec.md`
2. 将开发过程拆解为**可独立提交的步骤**，每个步骤包含：
   - **步骤序号与名称**
   - **目标**：这个步骤要做什么
   - **涉及文件**：需要创建或修改的文件列表
   - **验收标准**：怎么知道这一步做完了（**关键约束：每步完成后必须能独立通过测试，不影响已有功能**）
3. 写入 `.ai-coding/temp/{vId}/plan.md`
4. 汇总所有步骤的"涉及文件"，形成 `allowedPaths` 列表
5. 向主流程报告完成

**报告格式：**

```
plan 生成完成 ✅
路径：.ai-coding/temp/{vId}/plan.md
步骤数：N 个步骤
允许文件路径：[file1, dir2/, ...]
概要：[各步骤名称简述]
```

#### 4.2 AI 校验循环（主流程编排）

plan-generator 报告后，主流程启动校验循环，驱动 **plan-reviewer** 和 **plan-generator** 交替工作：

```
循环（最多5轮）：
  1. 主流程启动 plan-reviewer
  2. plan-reviewer 读取 .ai-coding/temp/{vId}/plan.md
  3. plan-reviewer 生成校验建议 → 写入 .ai-coding/temp/{vId}/plan-suggest.md
  4. plan-reviewer 向主流程报告完成
  5. 主流程读取 plan-suggest.md，判断：
     a. 无问题（或仅轻微措辞建议） → 删除 plan-suggest.md，退出循环 ✅
     b. 有实质性问题 → 进入第 6 步
  6. 主流程启动 plan-generator（修补模式），传递 plan-suggest.md 内容
  7. plan-generator 读取 plan-suggest.md，逐条采纳建议并修改 plan.md
  8. plan-generator 向主流程报告修补完成
  9. 主流程删除 plan-suggest.md
  10. 回到第 1 步进行下一轮校验
```

**各角色职责：**

| 角色 | 职责 |
|------|------|
| **plan-reviewer** | 以独立、挑剔视角审视 plan.md，专注于检查步骤划分是否合理、文件是否完整、依赖顺序是否正确、是否存在遗漏。输出 `plan-suggest.md` 给主流程，不直接修改 plan.md |
| **plan-generator（修补模式）** | 读取 `plan-suggest.md`，逐条评估并采纳合理建议，修改 `plan.md` |
| **主流程** | 读取 `plan-suggest.md` 判断是否有实质性问题；驱动循环流程；管理临时文件 |

> - 循环最多 **5 轮**，超过后强制退出
> - plan-reviewer 每次都以"第一次审查"的心态重新审视
>
> **审查标准**：plan-reviewer 使用 `references/review-plan.md` 中定义的 P0/P1/P2 分类表和检查重点作为审查标准（详见 [review-plan.md](../references/review-plan.md)）。
>
> **启动 prompt 改造**：启动 plan-reviewer 时，将 `references/review-plan.md` 的以下内容注入 prompt：
> - P0/P1/P2 分类表（用于分类建议）
> - 检查重点清单（用于指导审查方向）
> - 判断标准（用于指导建议的"度"）
>
> **主流程判断"无问题"的标准**：
> - plan-reviewer 输出的建议文件中：
>   - P0 列表为空（无步骤遗漏、依赖正确、顺序合理、验收标准可衡量，见 `references/review-plan.md §4`）
>   - P1 列表中无"步骤遗漏"或"依赖错误"类的实质性问题

#### 4.3 用户确认

AI 校验循环结束后（无论正常退出还是达到 5 轮上限），主流程向用户展示 plan 关键内容，并提供选项：

```
> 1. 继续
> 2. 重新生成
> 3. 补充信息
> 4. 再次 AI 校验
> 5. 手动修改
```

- **1 继续** → 进入 4.4
- **2 重新生成** → 重新进入 4.1（启动 plan-generator 重新生成），并告知用户上一版已被丢弃
- **3 补充信息** → 更新 `state.json` 添加 `waitingFor: "user_supplement"` 字段标记等待状态，提示用户"请直接在对话框中输入需要补充的内容（例如遗漏的步骤、修改的需求、新增的约束等）"，用户提供补充信息后清除 `waitingFor` 字段。如果补充信息涉及需求变更或 spec 调整，主流程应先引导用户更新 spec.md（回到 Step 3.3），然后再基于更新后的 spec 重新生成 plan。否则直接重新启动 plan-generator（带上补充信息作为额外输入），再次进入 4.2 校验循环
- **4 再次 AI 校验** → 重新进入 4.2 校验循环（plan-reviewer 再次审查当前 plan.md），完成后回到此界面
- **5 手动修改** → 告知用户可直接编辑 `.ai-coding/temp/{vId}/plan.md` 文件。如果新增或修改了涉及文件，需同步更新 `state.json` 中的 `plan.allowedPaths`。修改完成后输入"继续"回到此界面重新选择

#### 4.4 写入状态与文件范围

用户选择"继续"后：

1. **写入 allowedPaths**：将 plan-generator（最新修补后）报告的 `allowedPaths` 写入 `state.json`：
   ```json
   {
     "status": "plan_confirming",
     "step": 4,
     "plan": {
       "allowedPaths": [
         "src/auth/login.ts",
         "src/auth/middleware.ts",
         "src/models/user.ts",
         "tests/auth/",
         "package.json"
       ]
     },
     "updatedAt": "..."
   }
   ```
   > 路径可以是文件或目录。如果是目录，表示该目录下所有文件都在允许范围内。
2. 告知用户文件范围已锁定，进入 Step 5

### Step 5：执行与测试

将 plan 的执行、文件范围校验、测试验证交由一个独立的 **Execution 角色** 处理。主流程负责启动、接收报告和用户交互。

#### 5.1 启动 Execution

启动 Execution 前，主流程先检查当前 git 分支：

- 如果当前在 `main`、`master`、`develop` 等保护分支上，**询问用户是否创建功能分支**
  - 用户确认 → 创建并切换到功能分支（如 `feat/{vId}`）
  - 用户拒绝 → 在当前分支继续执行
- 如果当前已在功能/特性分支上，直接继续

然后启动 **Execution**，传递以下信息：

- `plan.md` 路径：`.ai-coding/temp/{vId}/plan.md`
- `state.json` 路径：`.ai-coding/temp/{vId}/state.json`（含 `allowedPaths`）
- 项目根目录上下文
- 工作模式：Execution 直接操作项目文件（非隔离 worktree），`git` 命令在项目根目录执行

**Execution 的职责：**

Execution 按 plan.md 中的步骤**逐个**执行，每步流程如下：

```
每步循环：
  1. 告知主流程："开始执行 Step N: [名称]"
  2. 📐 **预先声明**：列出本步骤计划创建/修改的所有文件
  3. 📐 **预先校验**：验证计划文件是否在 allowedPaths 范围内
     - 使用 `git status --porcelain` 检查当前工作区是否干净（确保无遗留变更）
       - ✅ 干净 → 继续执行
       - ❌ 有未提交变更 → 判断变更来源：
         - 属于上一步骤的残留 → 询问用户是否丢弃（`git checkout --` / `git restore`）
         - 属于被 `.gitignore` 忽略的文件 → 自动跳过
         - 无法判断 → 告知主流程并暂停
     - 逐一验证每个计划文件：
       - 匹配项目 `.gitignore` 中任意规则的路径 → **自动豁免**（被 git 忽略的文件不应触发越界）
       - 以 `.ai-coding/` 开头的路径 → **自动豁免**（工作流自身状态文件始终允许修改）
       - 其他路径 → 检查是否在 state.json.plan.allowedPaths 范围内
         （文件路径匹配任意条目，或以某条目录条目为前缀）
     - ✅ 全部在范围内 → 继续执行
     - ❌ 存在越界 → 告知主流程并停止，说明越界文件详情
  4. 实现：编写代码实现该步骤的目标
  5. 📐 **实现后校验**：使用 `git status --porcelain` 获取实际变更文件，逐一验证是否在 allowedPaths 范围内
     - ✅ 全部在范围内 → 继续
     - ❌ 存在越界 → 回退越界文件（git restore 或 git checkout --），告知主流程
  6. 🔍 **分层验证**：
     - ① 编译/类型检查（如 tsc --noEmit、go build、cargo check）
     - ② Linter 检查（如 eslint、staticcheck、cargo clippy）
     - 根据项目工具链自动选择验证方式（见下方"编译/Lint 自动检测"规则）
  7. ✅ **运行测试**（按"测试命令自动检测"规则匹配项目测试命令）：
     - ✅ 通过 → 继续下一步
     - ❌ 失败 → 停止并向主流程报告失败详情（准确定位到问题步骤）
  8. Git 提交：git commit，提交信息采用 Conventional Commits 格式：
     <type>: <≤50字中文描述>
     type 取值为 feat / fix / refactor / test / docs / chore，根据实际变更类型选择
     示例：feat: 添加用户登录接口
           fix: 修复 token 过期未处理的问题
           refactor: 提取通用 auth 中间件
  9. 更新 state.json：
     - step: 5（在整个执行阶段保持不变，表示处于第 5 大阶段）
     - currentStep: N（更新为当前 plan 步骤序号）
     - 告知主流程："Step N 完成 ✅"
```

**报告格式（正常完成）：**

```
执行完成 ✅
完成步骤：N/N
测试结果：全部通过
提交记录：
  • feat: xxx
  • feat: xxx
```

**报告格式（出错暂停）：**

```
执行暂停 ❌
问题步骤：Step N
问题类型：文件越界 / 执行出错 / 测试失败
详情：[越界文件列表 / 错误信息 / 失败测试详情]
```

#### 5.2 主流程处理结果

**情况 A：全部执行完成，测试通过**

主流程向用户展示完成信息，进入验收流程：

```
> 🎉 所有步骤执行完成，测试全部通过！
>
> 提交记录：
>   • feat: xxx
>   • feat: xxx
>
> 请验收：
> 1. 验收通过
> 2. 用户补充信息
```

- **1 验收通过** → 执行归档操作：
  1. 将 `.ai-coding/temp/{vId}/` 整个文件夹移动到 `.ai-coding/history/{vId}/`
  2. 更新 `state.json`（此时文件已在新位置）：
     - `status: "accepted"`
     - `specPath: ".ai-coding/history/{vId}/spec.md"`
     - `planPath: ".ai-coding/history/{vId}/plan.md"`
  3. 告知用户"已归档至 `.ai-coding/history/{vId}/`"
  4. 进入 Step 6
- **2 用户补充信息** → 记录用户补充信息，用户可以指定回退到之前的某一步：
  - 回退到指定步骤：
    1. 通过 `git log --oneline` 查看提交历史，找到目标步骤对应提交的 hash
       （提交信息的格式已约定为 `<type>: <描述>`，可根据描述的步骤特征定位）
    2. 计算从该提交到 HEAD 的提交数量 N
    3. 执行 `git reset --soft HEAD~N` 回退（保留工作区修改）
    4. 已回退的提交仍可通过 `git reflog` 恢复
  - 修改 `state.json` 中的 `currentStep` 和 `status`
  - 从指定步骤重新启动 Execution 执行

**情况 B：执行过程中出错/越界/测试失败**

主流程向用户展示问题详情，并提供选项：

```
> ❌ 执行 Step N 时遇到问题：
>
> 问题类型：[文件越界 / 执行出错 / 测试失败]
> 问题描述：[具体信息]
>
> 请选择处理方式：
> 1. 重新执行该步骤
> 2. 重新执行所有步骤（从头开始）
> 3. 补充信息
```

| 选项 | 行为 |
|------|------|
| **1 重新执行该步骤** | 分两种情况：
  - **已有提交**（文件越界修复前可能已提交，或执行完成但用户不满意）：先执行 `git reset --soft HEAD~1` 回退最近一次提交（保留工作区修改）。如果该步骤产生了多个提交，通过 `git log --oneline` 结合提交信息中的步骤标记（如 `feat: xxx` 对应的步骤范围）或大致时间范围来定位；如果无法精确识别，优先只回退最近一次提交，然后询问用户是否需要继续回退
  - **未提交**（执行出错/测试失败，尚未 git commit）：无需回退提交，直接用 `git checkout -- <变更文件>` 或 `git restore <变更文件>` 清理工作区变更
  然后主流程重新启动 Execution（指定从 Step N 开始）。state.json 中 `step` 不变 |
| **2 重新执行所有步骤** | 重置到 Step 1 状态（保留 spec 和 plan 文件）。通过 `git reset --soft` 回退所有提交，清空 `state.json` 中的 `currentStep`，从 Step 1 重新启动 Execution |
| **3 补充信息** | 更新 `state.json` 添加 `waitingFor: "user_supplement"` 字段标记等待状态 → 用户提供补充信息后清除 `waitingFor` 字段 → 更新 spec/plan → 根据需要同步更新 `state.json.plan.allowedPaths` → 重新启动 Execution 从当前步骤继续 |

> 如果 Execution 的响应不符合预期格式（无法解析状态或详细信息），主流程尝试重试一次该步骤；若仍异常，向用户展示原始输出并询问处理方式。
>
> 如果问题持续出现，重复此流程直到解决或用户选择 2 重新开始。建议主流程跟踪同一问题的重试次数，连续重试 3 次仍未解决时，主动建议用户选择"重新开始"或"补充信息"来调整方案，不再机械重复。

### Step 6：验收后询问推送

测试/验收通过后，询问用户：

```
> 🎉 验收通过！归档至 .ai-coding/history/{vId}/
>
> 已完成的工作：
> - 需求：{name}
> - ID：{vId}
> - 步骤数：N 个步骤已完成
> - 提交记录：
>   • feat: xxx
>   • feat: xxx
>
> 是否推送远程代码？
> 1. 推送
> 2. 不处理
```

- **1 推送** → 执行 `git push`
  - ✅ push 成功 → 更新 `.ai-coding/history/{vId}/state.json`（`status: "completed"`）
  - ❌ push 失败 → 分析失败原因并提供对应处理：
    - **无远程仓库** → 提示用户先添加远程仓库
    - **权限不足/网络问题** → 重试或手动推送
    - **远程冲突（非快进）** → 提供选项：
      > 1. 强制推送（`git push --force`，适用于功能分支，⚠️ 会覆盖远程历史）
      > 2. 先 pull 再推送（`git pull --rebase && git push`）
      > 3. 手动处理
      > 4. 跳过推送（代码保留在本地）
    > 对于功能分支（`feat/{vId}`）可安全使用 force push；对于共享分支不应 force push。
- **2 不处理** → 告知用户代码已在本地，随时可手动推送，更新 `.ai-coding/history/{vId}/state.json`（`status: "completed"`）

> 注意：此时 `state.json` 已随文件夹移动到 `.ai-coding/history/{vId}/` 下，更新时使用新路径。

## 状态文件更新时机

`state.json` 中两个步骤相关字段的区分：
- **`step`**：大阶段编号，标识当前处于哪个大阶段
- **`currentStep`**：plan 中的具体步骤序号，仅在执行阶段（step=5）使用，每完成一个 plan step 更新一次

每次以下操作完成后，都需要更新 `state.json` 中的 `status`、`step`、`currentStep` 和 `updatedAt`：

| 操作 | `status` | `step` | `currentStep` | 文件位置 |
|------|----------|--------|---------------|---------|
| 初始化完成 | `initialized` | 2 | `null` | `.ai-coding/temp/{vId}/state.json` |
| AI 校验开始 | `spec_reviewing` | 3 | `null` | `.ai-coding/temp/{vId}/state.json` |
| 用户确认通过 | `spec_confirming` | 3 | `null` | `.ai-coding/temp/{vId}/state.json` |
| AI 校验开始 | `plan_reviewing` | 4 | `null` | `.ai-coding/temp/{vId}/state.json` |
| 用户确认（写入 `allowedPaths`） | `plan_confirming` | 4 | `null` | `.ai-coding/temp/{vId}/state.json` |
| 每执行完一个 plan step | `executing` | 5 | 当前 plan 步骤序号 | `.ai-coding/temp/{vId}/state.json` |
| 全部步骤执行完 | `acceptance` | 5 | 最后步骤序号 | `.ai-coding/temp/{vId}/state.json` |
| 回退到某一步 | `executing` | 5 | 回退到的步骤序号 | `.ai-coding/temp/{vId}/state.json` |
| **验收通过（归档）** | **`accepted`** | **5** | 最后步骤序号 | `.ai-coding/history/{vId}/state.json`（从 temp 移入）|
| 推送完成 / 不处理 | `completed` | 6 | 最后步骤序号 | `.ai-coding/history/{vId}/state.json` |

> `waitingFor` 字段在上述流程中独立设置/清除，不影响 `status`、`step`、`currentStep`。
> 设置时机：用户选择"补充信息"时设为 `"user_supplement"`
> 清除时机：用户完成补充输入后清除为 `null`

## 中断恢复机制

整个流程支持断点恢复。启动时，主流程检查 `.ai-coding/temp/` 目录：

1. 如果 `.ai-coding/temp/` 中**不存在**任何 `{vId}` 子目录 → 正常启动新工作流
2. 如果 `.ai-coding/temp/` 中**存在** `{vId}` 子目录，且 `state.json` 的 `status` 不是 `"accepted"` 或 `"completed"`：
   - **单个未完成** → 直接询问用户是否继续
   - **多个未完成** → 列出所有未完成的 `{vId}`（含需求名、状态、上次更新时间），让用户选择恢复其中一个（**其他未完成需求保留在 `.ai-coding/temp/` 中，可下次恢复**），或选择"开始新的需求"：
     ```
     > 检测到多个未完成的需求：
     >
     > 1. 登录功能 (登录功能_aBcDeFgHiJ) — executing, 上次更新 2026-07-29T10:00
     > 2. 注册功能 (注册功能_zYxWvUtSrQ) — spec_reviewing, 上次更新 2026-07-28T15:00
     > 3. 开始新的需求（丢弃以上所有）
     ```
     用户选择恢复 1. 或 2. 后，仅恢复选中的需求，其他未完成需求保留在 `.ai-coding/temp/` 中。
   ```
   > 检测到未完成的需求：
   > - 需求：{name}
   > - ID：{vId}
   > - 当前状态：{status}（停留在第 {step} 阶段）
   > - 上次更新：{updatedAt}
   >
   > 是否继续未完成的工作？
   > 1. 继续
   > 2. 丢弃并开始新的需求
   ```
   - **1 继续** → 读取 `state.json`，先检查 `waitingFor` 字段：
     - `waitingFor: "user_supplement"` → 从对应的补充信息环节继续，提示用户输入补充信息
     - `waitingFor` 为 `null` 或不存在 → 根据 `status` 正常跳转
     - `spec_reviewing` → 检测 `.ai-coding/temp/{vId}/spec-suggest.md` 是否存在且有实质性问题：
       - 是 → 从 Step **3.2 AI 校验循环**继续（启动 spec-generator 修补模式）
       - 否 → 从 Step **3.3 用户确认**继续（校验已完成，直接展示确认界面）
     - `spec_confirming` → 从 Step 3.3 用户确认继续
     - `plan_reviewing` → 检测 `.ai-coding/temp/{vId}/plan-suggest.md` 是否存在且有实质性问题：
       - 是 → 从 Step **4.2 AI 校验循环**继续（启动 plan-generator 修补模式）
       - 否 → 从 Step **4.3 用户确认**继续（校验已完成，直接展示确认界面）
     - `plan_confirming` → 从 Step 4.3 用户确认继续
     - `executing` → 从 Step 5 继续：
       1. 读取 `plan.md`，定位到 `currentStep + 1` 步骤的内容
       2. 检查工作区状态：
          - 工作区干净 → 正常从 `currentStep + 1` 开始执行
          - 有未提交变更（上次中断遗留） → 判断变更是否属于当前步骤的预期工作：
            - 是 → 保留变更，继续完成该步骤
            - 否 → 询问用户是否丢弃遗留变更
       3. 重新启动 Execution，传递恢复上下文信息
       如果 `currentStep` 为空（未完成任何步骤就中断），从 Step 1 开始
     - `acceptance` → 从 Step 5 验收继续
   - **2 丢弃** → 删除对应的 `.ai-coding/temp/{vId}/` 目录，正常启动新工作流

## 测试命令自动检测

当运行测试时，按以下优先级自动检测项目测试命令：

| 项目类型 | 检测文件/字段 | 测试命令 |
|---------|--------------|---------|
| Node.js (npm) | `package.json` 中的 `scripts.test` | `npm test` |
| Node.js (yarn) | `yarn.lock` + `package.json` 中的 `scripts.test` | `yarn test` |
| Node.js (pnpm) | `pnpm-lock.yaml` + `package.json` 中的 `scripts.test` | `pnpm test` |
| Python | `pytest.ini` / `pyproject.toml` / `setup.py` | `pytest` 或 `python -m pytest` |
| Rust | `Cargo.toml` | `cargo test` |
| Go | `go.mod` | `go test ./...` |
| Java | `pom.xml` / `build.gradle` | `mvn test` 或 `gradle test` |
| 通用 Makefile | `Makefile` 中的 `test` target | `make test` |

检测到项目类型后使用对应的测试命令。如果无法自动检测，询问用户应使用什么测试命令。

## 编译/Lint 自动检测

分层验证中的编译/类型检查和 Linter 按以下规则自动匹配：

| 验证类型 | 检测文件 | 命令 |
|---------|---------|------|
| 编译/类型检查 | `tsconfig.json` | `tsc --noEmit` |
| 编译/类型检查 | `Cargo.toml` | `cargo check` |
| 编译/类型检查 | `go.mod` | `go build ./...` |
| 编译/类型检查 | `pom.xml` / `build.gradle` | `mvn compile` / `gradle compileJava` |
| Linter | `.eslintrc*` | `eslint .` |
| Linter | `Cargo.toml`（有 clippy 配置） | `cargo clippy` |
| Linter | `go.mod` | `staticcheck ./...` |
| Linter | `.pylintrc` / `pyproject.toml`（有 pylint 配置） | `pylint .` |
| Linter | `Makefile` 中 lint target | `make lint` |

> 无编译步骤的语言（Python、Ruby 等）自动跳过编译/类型检查；无 linter 配置文件时自动跳过 lint 检查。跳过的检查不计入成功或失败。

## 使用示例

**用户输入：**
> 我想给这个项目加一个用户登录功能，用 JWT token，不需要注册页面，直接用预设账号登录。

**skill 应当：**

1. 复述需求并澄清
2. 初始化：生成 name="登录功能"，shortId="aBcDeFgHiJ"，vId="登录功能_aBcDeFgHiJ"
3. 生成 spec，经用户确认通过后保存到 `.ai-coding/temp/登录功能_aBcDeFgHiJ/`
4. 生成 plan，经用户确认通过后保存到同目录
5. 逐个执行 plan 步骤，每步按 Conventional Commits 格式提交（如 `feat: 添加登录接口`）
6. 执行完成提示用户验收
7. 验收通过后，将文件夹归档至 `.ai-coding/history/登录功能_aBcDeFgHiJ/`
8. 询问是否推送
