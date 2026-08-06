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

`ai-coding-workflow` 遵循标准 Codex skill 仓库格式，仓库根目录即为 skill 根：

```
ai-coding-workflow/                  # 仓库根 = skill 根
├── SKILL.md                          # (必须) 技能核心入口，包含描述和触发词
├── agents/
│   └── openai.yaml                   # (必须) Codex 接口配置
├── references/                       # (可选) 参考文档，供按需加载
│   ├── review-spec.md
│   ├── review-plan.md
│   └── review-exec.md
├── scripts/                          # (可选) 辅助脚本（零依赖，仅用 Node.js 内置模块）
│   ├── workflow.mjs                  # 核心脚本强制层（状态流转/文件范围/证据采集）
│   ├── validate.mjs                  # JSON Schema 校验器
│   └── render.mjs                    # JSON → Markdown 渲染器
├── assets/                           # (可选) 模板、图片等资源
│   └── schema/                       # JSON Schema 契约（产物结构定义）
│       ├── state.schema.json
│       ├── spec.schema.json
│       └── plan.schema.json
├── docs/                             # (可选) 产品文档（不随仓库提交）
│   ├── PRD.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── agents.md
├── README.md
└── package.json
```

### 各文件/目录职责

| 路径 | 说明 |
|------|------|
| `SKILL.md` | skill 入口，由 Codex 加载执行。包含技能名称、描述、触发条件、完整工作流步骤 |
| `references/` | 参考文档，校验角色在生成 spec/plan 时可按需加载（P0/P1/P2 审查标准） |
| `scripts/workflow.mjs` | 核心脚本强制层：状态流转校验、文件范围校验、验证命令执行、证据采集 |
| `scripts/validate.mjs` | JSON Schema 校验器：校验 state/spec/plan 是否符合契约 |
| `scripts/render.mjs` | 视图渲染器：将 spec.json/plan.json 渲染为 Markdown 视图 |
| `assets/schema/` | JSON Schema 契约：state/spec/plan 的结构定义 |

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
│       ├── state.json              # 状态文件（含 version/evidence 字段）
│       ├── spec.json               # 规格文档 JSON（事实来源）
│       ├── spec.md                 # 规格文档 Markdown（脚本渲染，禁止手改）
│       ├── plan.json               # 执行计划 JSON（事实来源）
│       ├── plan.md                 # 执行计划 Markdown（脚本渲染，禁止手改）
│       ├── spec-suggest.md         # 校验建议（临时，校验通过后删除）
│       ├── plan-suggest.md         # 校验建议（临时，校验通过后删除）
│       └── evidence/               # 执行证据目录
│           ├── {stepId}-before.json  # 步骤前文件 hash 快照
│           ├── {stepId}-result.json  # 验证命令输出
│           └── {stepId}-after.patch  # 步骤后 diff patch
└── history/        # 存放历史生成记录
    └── {vId}/      # 验收通过后从 temp 移入
        ├── state.json
        ├── spec.json
        ├── spec.md
        ├── plan.json
        ├── plan.md
        └── evidence/
```

> **建议**：将 `.ai-coding/temp/` 添加到项目的 `.gitignore` 中（运行时状态如 `state.json` 包含时间戳、路径等本地信息，不应提交），而 `.ai-coding/history/` 可以根据需要选择性提交以保留开发记录。

### 2. Skill 仓库根目录

本 skill 的源代码遵循标准 skill 仓库格式，仓库根目录即为 skill 根：

| 路径 | 必选/可选 | 说明 |
|------|-----------|------|
| `SKILL.md` | **必选** | 技能核心入口，包含完整的工作流定义 |
| `agents/openai.yaml` | **必选** | Codex 接口配置 |
| `references/` | 可选 | 参考文档，供校验角色按需加载 |
| `scripts/` | 可选 | 辅助脚本（.py、.sh、.js 等） |
| `assets/` | 可选 | 模板、图片等静态资源 |
| `docs/` | 可选 | 产品文档（PRD、开发计划、代理指引） |

## 初始化信息生成

在每次工作流启动时，自动生成以下信息并写入状态文件：

| 字段 | 说明 | 生成规则 |
|------|------|---------|
| `name` | 需求名称 | 将本次的用户需求总结为**不超过10个字的中文描述** |
| `vId` | 需求ID | `{name}_{date}_{hash}`，由脚本自动生成，如 `登录功能_20260806_a3f2b1` |
| `date` | 创建日期 | 脚本自动生成，格式 YYYYMMDD |
| `hash` | 防碰撞标识 | 脚本自动生成，6 位随机小写字母数字 |

### state.json 结构

```json
{
  "version": 1,
  "vId": "登录功能_20260806_a3f2b1",
  "name": "登录功能",
  "date": "20260806",
  "hash": "a3f2b1",
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
  },
  "evidence": {
    "dir": ".ai-coding/temp/登录功能_aBcDeFgHiJ/evidence"
  }
}
```

| 字段 | 说明 |
|------|------|
| `version` | 状态文件版本号，**固定为 1**，用于后续版本兼容性判断（脚本 `load-state` 会校验此字段） |
| `evidence` | 证据目录配置，`evidence.dir` 指向本次任务的执行证据目录路径，由 `snapshot-before` / `snapshot-after` 写入快照、验证输出、diff patch |

> `waitingFor`：可选字段，等待用户输入时标记等待状态（如 `"user_supplement"`），值为 `null` 表示不在等待状态。配合中断恢复使用：恢复时检查此字段，跳转到对应的补充输入环节。

`plan.allowedPaths` 在 plan 确认通过时写入（详见 Step 4.4），记录本次开发允许修改/新增的所有文件和目录路径，用于 Step 5 执行时的文件范围校验。脚本 `check-scope` 会基于此字段做机器级校验。

### 状态流转

`status` 字段记录当前所处阶段，流转顺序为：

```
initialized → spec_reviewing → spec_confirming → plan_reviewing → plan_confirming → executing → acceptance → accepted → completed
```

每次状态变更时同步更新 `updatedAt`。

> 在"补充信息"场景中，`status` 保持当前阶段不变，同时设置 `waitingFor: "user_supplement"` 标记等待用户输入。中断恢复时需检查此字段来判断是否需要回到补充信息环节。

## 命名规则

运行时文件名固定，不携带 name/date/hash 前缀：

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

1. 生成 `name`（需求总结，≤10字中文）
2. 调用 `node scripts/workflow.mjs init <项目根目录> <name>` 初始化
   - 脚本自动生成 `date`（YYYYMMDD）和 `hash`（6位随机），构造 `vId = {name}_{date}_{hash}`
   - 脚本自动创建 `.ai-coding/temp/{vId}/`、`.ai-coding/history/`、`.ai-coding/temp/{vId}/evidence/` 目录
   - 脚本原子写入 `state.json`（含 `version: 1`、`status: "initialized"`、`evidence.dir` 等字段）
   - 执行时的工作目录是目标项目根，脚本路径相对于 skill 仓库根
3. 主流程从脚本输出中读取 `vId`，告知用户初始化完成

### Step 3：Spec 生成

spec 生成阶段由**两个独立角色**协作完成（注意：每次循环都启动新的角色实例，角色名仅描述职责）：

- **spec-generator**：负责初始生成 spec.json（事实来源），以及根据校验建议修补 spec.json
- **spec-reviewer**：负责校验 spec.md（脚本渲染的 Markdown 视图），生成 `spec-suggest.md`（校验建议文件）

主流程充当编排者，驱动"生成 → 校验 → 修补 → 再校验"的循环。

> **关键约束**：`spec.json` 是事实来源，`spec.md` 由 `render.mjs` 渲染生成（**禁止手改**）。所有修补都作用于 `spec.json`，修补后必须重新渲染 `spec.md`。

#### 3.1 初始生成（spec-generator）

主流程启动 **spec-generator**，分配以下任务：

> **Claude Code 适配**：使用 Task 工具启动子 Agent，实现上下文隔离。
> ```
> Task(
>   subagent_type: "general_purpose_task",
>   description: "生成 spec.json",
>   query: "你是 spec-generator。读取项目上下文和用户需求：{需求原文}。
>           生成 spec.json（符合 assets/schema/spec.schema.json 契约），写入 .ai-coding/temp/{vId}/spec.json。
>           字段要求：{字段结构说明}
>           内容格式约束：{结构化文本规则}
>           完成后返回 spec 核心概要。"
> )
> ```
> Codex 环境：主流程切换 prompt 扮演 spec-generator。

**spec-generator 的职责：**

1. 读取项目上下文和用户需求
2. 生成规格文档 `spec.json`（JSON 格式，符合 `assets/schema/spec.schema.json` 契约），字段结构：
   - `title`：需求标题（≤50 字）
   - `background`：背景与动机（**结构化文本**：`{ summary, details[] }`，details 拆为 3-8 个要点）
   - `goal`：目标与成功标准（**结构化文本**：`{ summary, details[] }`）
   - `scope`：范围边界（**必填**：`{ summary, inScope[], outOfScope[] }`，明确做什么/不做什么）
   - `userScenarios`：用户场景列表（**必填**：`[{ role, action, goal }]`，描述谁、做什么、为什么）
   - `features`：功能规格列表，每个含 `name` / `description`（**结构化文本**）/ `userScenario`（关联场景）/ `inputs` / `outputs` / `edgeCases`
   - `constraints`：技术约束与业务假设（**必填**：`[{ type, description }]`，type 取 technical/business/compatibility/security/performance）
   - `acceptance`：验收标准（每条 ≤200 字，可验证，禁止模糊表述）
   - `nonFunctional`：非功能需求（性能、安全、兼容性等，每条 ≤200 字）
   - `technicalApproach`：技术方案（**结构化文本**，可选）
   - `fileStructure`：预计创建/修改的文件列表（可选）
   - `openQuestions`：待确认的开放问题（可选，每条 ≤200 字）
3. 写入 `.ai-coding/temp/{vId}/spec.json`
4. 向主流程报告完成

> **内容格式约束**（spec-generator 必须遵守）：
> - 所有标记为"结构化文本"的字段，必须使用 `{ summary, details[] }` 格式，禁止写成单个长段落
> - `summary` 一句话概述（≤200 字），`details` 拆为 3-8 个要点（每条 ≤300 字）
> - `scope.inScope` 和 `scope.outOfScope` 必须明确列出，防止后续 plan 阶段范围蔓延
> - `acceptance` 每条必须可验证，禁止出现"系统应流畅运行""用户体验良好"等模糊表述
> - `edgeCases` 覆盖空状态、错误状态、并发、权限、超时等边界

主流程收到 spec-generator 完成报告后，依次执行：

1. 调用 `node scripts/validate.mjs spec .ai-coding/temp/{vId}/spec.json` 校验 JSON 结构
   - 退出码 0 = 通过；退出码 1 = 校验失败（需回到 spec-generator 修补）
2. 调用 `node scripts/render.mjs spec .ai-coding/temp/{vId}/spec.json .ai-coding/temp/{vId}/spec.md` 渲染 Markdown 视图
3. `spec.md` 是渲染产物，**禁止手改**；后续 reviewer 审查的是此 Markdown 视图

**报告格式：**

```
spec 生成完成 ✅
JSON 路径：.ai-coding/temp/{vId}/spec.json
Markdown 视图：.ai-coding/temp/{vId}/spec.md
概要：[2-3 句话总结 spec 核心内容]
主要涉及文件：file1, file2, ...
```

#### 3.2 AI 校验循环（主流程编排）

spec-generator 报告后，主流程启动校验循环，驱动 **spec-reviewer** 和 **spec-generator** 交替工作：

> **Claude Code 适配**：spec-reviewer 和 spec-generator（修补模式）各自通过 Task 工具启动独立子 Agent。reviewer 子 Agent 天然看不到 generator 的生成过程，实现物理盲审。
> ```
> // 启动 reviewer
> Task(
>   subagent_type: "general_purpose_task",
>   description: "审查 spec.md",
>   query: "你是 spec-reviewer，以独立挑剔视角审查文档。
>           读取 .ai-coding/temp/{vId}/spec.md。
>           审查标准：读取 references/review-spec.md 的 P0/P1/P2 分类。
>           每个问题必须附带证据（引用文档原文 + 具体位置）。
>           输出 spec-suggest.md 到 .ai-coding/temp/{vId}/spec-suggest.md。
>           返回摘要：发现几个 P0/P1/P2 问题。"
> )
>
> // 启动 generator（修补模式）
> Task(
>   subagent_type: "general_purpose_task",
>   description: "修补 spec.json",
>   query: "你是 spec-generator（修补模式）。
>           读取 .ai-coding/temp/{vId}/spec-suggest.md 中的建议。
>           逐条评估并采纳合理建议，修改 .ai-coding/temp/{vId}/spec.json。
>           不直接修改 spec.md。
>           返回：采纳了哪些建议、拒绝了哪些及理由。"
> )
> ```
> Codex 环境：主流程切换 prompt 依次扮演 reviewer 和 generator。

```
循环（最多3轮）：
  1. 主流程启动 spec-reviewer
  2. spec-reviewer 读取 .ai-coding/temp/{vId}/spec.md（Markdown 视图）
  3. spec-reviewer 生成校验建议 → 写入 .ai-coding/temp/{vId}/spec-suggest.md
  4. spec-reviewer 向主流程报告完成
  5. 主流程读取 spec-suggest.md，判断：
     a. 无问题（或仅轻微措辞建议） → 删除 spec-suggest.md，退出循环 ✅
     b. 有实质性问题 → 进入第 6 步
  6. 主流程启动 spec-generator（修补模式），传递 spec-suggest.md 内容
  7. spec-generator 读取 spec-suggest.md，逐条采纳建议并修改 spec.json（事实来源）
  8. spec-generator 向主流程报告修补完成
  9. 主流程调用 validate.mjs + render.mjs 重新校验并渲染 spec.md（详见 3.1）
  10. 主流程删除 spec-suggest.md
  11. 回到第 1 步进行下一轮校验
```

**各角色职责：**

| 角色 | 职责 |
|------|------|
| **spec-reviewer** | 以独立、挑剔视角审视 spec.md（Markdown 视图），专注于找出遗漏、矛盾、不清晰之处。输出 `spec-suggest.md` 给主流程，不直接修改 spec.json / spec.md |
| **spec-generator（修补模式）** | 读取 `spec-suggest.md`，逐条评估并采纳合理建议，修改 `spec.json`（事实来源）。不质疑 reviewer 的发现，专注修补。**不直接修改 spec.md** |
| **主流程** | 读取 `spec-suggest.md` 判断是否有实质性问题；驱动循环流程；管理临时文件；修补后调用脚本重新渲染 spec.md |

> - 循环最多 **3 轮**，超过后强制退出
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

AI 校验循环结束后（无论正常退出还是达到 3 轮上限），主流程向用户展示 spec 关键内容，并提供选项：

```
> 1. 继续
> 2. 重新生成
> 3. 补充信息
> 4. 再次 AI 校验
> 5. 手动修改
```

- **1 继续** → 调用 `node scripts/workflow.mjs transition <statePath> spec_confirming --step 3` 流转状态，进入 Step 4
- **2 重新生成** → 重新进入 3.1（启动 spec-generator 重新生成 spec.json），并告知用户上一版已被丢弃
- **3 补充信息** → 调用 `node scripts/workflow.mjs transition <statePath> spec_reviewing --waiting user_supplement` 标记等待状态，提示用户"请直接在对话框中输入需要补充的内容（例如遗漏的功能、修改的需求、新增的约束等）"，用户提供补充信息后调用 `transition --waiting null` 清除等待标记，重新启动 spec-generator（带上补充信息作为额外输入），然后再次进入 3.2 校验循环
- **4 再次 AI 校验** → 重新进入 3.2 校验循环（spec-reviewer 再次审查当前 spec.md），完成后回到此界面
- **5 手动修改** → 告知用户可直接编辑 `.ai-coding/temp/{vId}/spec.json`（事实来源）。修改完成后由主流程调用 `validate.mjs` + `render.mjs` 重新渲染 spec.md，然后输入"继续"回到此界面重新选择

用户选择"继续"后，调用脚本流转状态：

```
node scripts/workflow.mjs transition <statePath> spec_confirming --step 3
```

### Step 4：Plan 生成

plan 生成阶段与 spec 生成阶段采用相同的**双角色协作模式**（同样每次启动新的角色实例）：

- **plan-generator**：负责初始生成 plan.json（事实来源），以及根据校验建议修补 plan.json
- **plan-reviewer**：负责校验 plan.md（脚本渲染的 Markdown 视图），生成 `plan-suggest.md`（校验建议文件）

> **关键约束**：`plan.json` 是事实来源，`plan.md` 由 `render.mjs` 渲染生成（**禁止手改**）。所有修补都作用于 `plan.json`，修补后必须重新渲染 `plan.md`。

#### 4.1 初始生成（plan-generator）

主流程启动 **plan-generator**，分配以下任务：

> **Claude Code 适配**：使用 Task 工具启动子 Agent，实现上下文隔离。
> ```
> Task(
>   subagent_type: "general_purpose_task",
>   description: "生成 plan.json",
>   query: "你是 plan-generator。读取已确认的 .ai-coding/temp/{vId}/spec.json。
>           生成 plan.json（符合 assets/schema/plan.schema.json 契约），写入 .ai-coding/temp/{vId}/plan.json。
>           字段要求：{字段结构说明}
>           内容格式约束：{结构化文本规则}
>           关键约束：每步完成后必须能独立通过测试，不影响已有功能。
>           完成后返回 plan 步骤概要。"
> )
> ```
> Codex 环境：主流程切换 prompt 扮演 plan-generator。

**plan-generator 的职责：**

1. 读取已确认的 `.ai-coding/temp/{vId}/spec.json`（事实来源，含完整需求上下文）
2. 生成执行计划 `plan.json`（JSON 格式，符合 `assets/schema/plan.schema.json` 契约），字段结构：
   - `summary`：计划概述（**结构化文本**：`{ summary, details[] }`）
   - `steps`：步骤列表，每个步骤含：
     - `id`：步骤序号
     - `name`：步骤名称（≤50 字）
     - `goal`：目标（**推荐结构化文本**：`{ summary, details[] }`，也支持纯 string 向后兼容。关键约束：每步完成后必须能独立通过测试，不影响已有功能）
     - `files`：涉及文件列表（需要创建或修改的文件）
     - `verification`：验收标准（每条 ≤200 字，怎么知道这一步做完了）
     - `dependencies`：依赖的其他步骤 id
     - `risk`：风险等级，取值 `"normal"` 或 `"guarded"`（`guarded` 表示受保护步骤，涉及敏感文件需人工确认）
3. 写入 `.ai-coding/temp/{vId}/plan.json`
4. 向主流程报告完成

> **内容格式约束**（plan-generator 必须遵守）：
> - `summary` 和 `goal` 使用结构化文本格式 `{ summary, details[] }`，禁止写成单个长段落
> - `summary` 一句话概述（≤200 字），`details` 拆为 3-8 个要点（每条 ≤300 字）
> - `verification` 每条 ≤200 字，一句话说清，禁止将多个验证点合并为一条
> - `files` 每个文件路径精确定位到具体文件，避免使用通配符或目录级模糊路径

主流程收到 plan-generator 完成报告后，依次执行：

1. 调用 `node scripts/validate.mjs plan .ai-coding/temp/{vId}/plan.json` 校验 JSON 结构
   - 退出码 0 = 通过；退出码 1 = 校验失败（需回到 plan-generator 修补）
2. 调用 `node scripts/render.mjs plan .ai-coding/temp/{vId}/plan.json .ai-coding/temp/{vId}/plan.md` 渲染 Markdown 视图
3. `plan.md` 是渲染产物，**禁止手改**；后续 reviewer 审查的是此 Markdown 视图

**报告格式：**

```
plan 生成完成 ✅
JSON 路径：.ai-coding/temp/{vId}/plan.json
Markdown 视图：.ai-coding/temp/{vId}/plan.md
步骤数：N 个步骤
概要：[各步骤名称简述]
```

> `allowedPaths` 不再由 plan-generator 汇总报告，而是由主流程在 Step 4.4 从 `plan.json` 的 `steps[].files` 提取（机器级汇总，避免遗漏）。

#### 4.2 AI 校验循环（主流程编排）

plan-generator 报告后，主流程启动校验循环，驱动 **plan-reviewer** 和 **plan-generator** 交替工作：

> **Claude Code 适配**：plan-reviewer 和 plan-generator（修补模式）各自通过 Task 工具启动独立子 Agent。reviewer 子 Agent 天然看不到 generator 的生成过程，实现物理盲审。
> ```
> // 启动 reviewer
> Task(
>   subagent_type: "general_purpose_task",
>   description: "审查 plan.md",
>   query: "你是 plan-reviewer，以独立挑剔视角审查文档。
>           读取 .ai-coding/temp/{vId}/plan.md。
>           审查标准：读取 references/review-plan.md 的 P0/P1/P2 分类。
>           每个问题必须附带证据（引用文档原文 + 具体位置）。
>           输出 plan-suggest.md 到 .ai-coding/temp/{vId}/plan-suggest.md。
>           返回摘要：发现几个 P0/P1/P2 问题。"
> )
>
> // 启动 generator（修补模式）
> Task(
>   subagent_type: "general_purpose_task",
>   description: "修补 plan.json",
>   query: "你是 plan-generator（修补模式）。
>           读取 .ai-coding/temp/{vId}/plan-suggest.md 中的建议。
>           逐条评估并采纳合理建议，修改 .ai-coding/temp/{vId}/plan.json。
>           不直接修改 plan.md。
>           返回：采纳了哪些建议、拒绝了哪些及理由。"
> )
> ```
> Codex 环境：主流程切换 prompt 依次扮演 reviewer 和 generator。

```
循环（最多3轮）：
  1. 主流程启动 plan-reviewer
  2. plan-reviewer 读取 .ai-coding/temp/{vId}/plan.md（Markdown 视图）
  3. plan-reviewer 生成校验建议 → 写入 .ai-coding/temp/{vId}/plan-suggest.md
  4. plan-reviewer 向主流程报告完成
  5. 主流程读取 plan-suggest.md，判断：
     a. 无问题（或仅轻微措辞建议） → 删除 plan-suggest.md，退出循环 ✅
     b. 有实质性问题 → 进入第 6 步
  6. 主流程启动 plan-generator（修补模式），传递 plan-suggest.md 内容
  7. plan-generator 读取 plan-suggest.md，逐条采纳建议并修改 plan.json（事实来源）
  8. plan-generator 向主流程报告修补完成
  9. 主流程调用 validate.mjs + render.mjs 重新校验并渲染 plan.md（详见 4.1）
  10. 主流程删除 plan-suggest.md
  11. 回到第 1 步进行下一轮校验
```

**各角色职责：**

| 角色 | 职责 |
|------|------|
| **plan-reviewer** | 以独立、挑剔视角审视 plan.md（Markdown 视图），专注于检查步骤划分是否合理、文件是否完整、依赖顺序是否正确、是否存在遗漏。输出 `plan-suggest.md` 给主流程，不直接修改 plan.json / plan.md |
| **plan-generator（修补模式）** | 读取 `plan-suggest.md`，逐条评估并采纳合理建议，修改 `plan.json`（事实来源）。**不直接修改 plan.md** |
| **主流程** | 读取 `plan-suggest.md` 判断是否有实质性问题；驱动循环流程；管理临时文件；修补后调用脚本重新渲染 plan.md |

> - 循环最多 **3 轮**，超过后强制退出
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

AI 校验循环结束后（无论正常退出还是达到 3 轮上限），主流程向用户展示 plan 关键内容，并提供选项：

```
> 1. 继续
> 2. 重新生成
> 3. 补充信息
> 4. 再次 AI 校验
> 5. 手动修改
```

- **1 继续** → 进入 4.4
- **2 重新生成** → 重新进入 4.1（启动 plan-generator 重新生成 plan.json），并告知用户上一版已被丢弃
- **3 补充信息** → 调用 `node scripts/workflow.mjs transition <statePath> plan_reviewing --waiting user_supplement` 标记等待状态，提示用户"请直接在对话框中输入需要补充的内容（例如遗漏的步骤、修改的需求、新增的约束等）"，用户提供补充信息后调用 `transition --waiting null` 清除等待标记。如果补充信息涉及需求变更或 spec 调整，主流程应先引导用户更新 spec.json（回到 Step 3.3，并由脚本重新渲染 spec.md），然后再基于更新后的 spec 重新生成 plan。否则直接重新启动 plan-generator（带上补充信息作为额外输入），再次进入 4.2 校验循环
- **4 再次 AI 校验** → 重新进入 4.2 校验循环（plan-reviewer 再次审查当前 plan.md），完成后回到此界面
- **5 手动修改** → 告知用户可直接编辑 `.ai-coding/temp/{vId}/plan.json`（事实来源）。修改完成后由主流程调用 `validate.mjs` + `render.mjs` 重新渲染 plan.md，然后输入"继续"回到此界面重新选择（`plan.allowedPaths` 由 4.4 自动从 plan.json 提取，无需手动维护）

#### 4.4 写入状态与文件范围

用户选择"继续"后：

1. **从 plan.json 提取 allowedPaths**：读取最新修补后的 `plan.json`，遍历 `steps[].files` 汇总所有文件路径，去重后形成 `allowedPaths` 列表
2. **写入 state.json 并流转状态**：调用脚本一次性完成 `allowedPaths` 写入和状态流转：
   ```
   node scripts/workflow.mjs transition <statePath> plan_confirming --step 4
   ```
   脚本会在原子写入 `status: "plan_confirming"`、`step: 4` 的同时，将提取的 `allowedPaths` 写入 `state.json.plan.allowedPaths`。最终 `state.json` 形如：
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
   > 路径可以是文件或目录。如果是目录，表示该目录下所有文件都在允许范围内。脚本 `check-scope` 在 Step 5 会基于此字段做机器级校验。
3. 告知用户文件范围已锁定，进入 Step 5

### Step 5：执行与测试

将 plan 的执行、文件范围校验、测试验证交由一个独立的 **Execution 角色** 处理。主流程负责启动、接收报告和用户交互。

#### 5.1 启动 Execution

启动 Execution 前，主流程先检查当前 git 分支：

- 如果当前在 `main`、`master`、`develop` 等保护分支上，**询问用户是否创建功能分支**
  - 用户确认 → 创建并切换到功能分支（如 `feat/{vId}`）
  - 用户拒绝 → 在当前分支继续执行
- 如果当前已在功能/特性分支上，直接继续

然后启动 **Execution**，传递以下信息：

> **Claude Code 适配**：使用 Task 工具启动子 Agent，execution 子 Agent 在独立上下文中执行代码变更，与 spec/plan 生成阶段完全隔离。
> ```
> Task(
>   subagent_type: "general_purpose_task",
>   description: "执行 plan 步骤",
>   query: "你是 Execution 角色。按 .ai-coding/temp/{vId}/plan.json 中的 steps 逐个执行。
>           状态文件：.ai-coding/temp/{vId}/state.json
>           每步流程：预先声明文件 → check-scope → 编码 → run-verify → snapshot → git commit → transition。
>           受保护步骤（risk=guarded）执行前暂停，请求人工确认。
>           文件越界或测试失败时立即停止，返回失败详情。
>           完成后返回：执行了几个步骤、每步状态。"
> )
> ```
> Codex 环境：主流程切换 prompt 扮演 Execution。
>
> 注意：execution 子 Agent 可按步骤粒度拆分——每个 plan step 启动一个独立 Task，步骤间通过 state.json 和 git commit 天然衔接。

- `plan.json` 路径：`.ai-coding/temp/{vId}/plan.json`（事实来源，含 `steps[].files` / `verification` / `risk`）
- `plan.md` 路径：`.ai-coding/temp/{vId}/plan.md`（人类可读视图）
- `state.json` 路径：`.ai-coding/temp/{vId}/state.json`（含 `allowedPaths` 与 `evidence.dir`）
- 项目根目录上下文
- 工作模式：Execution 直接操作项目文件（非隔离 worktree），`git` 命令在项目根目录执行

**Execution 的职责：**

Execution 按 plan.json 中的 steps **逐个**执行，每步流程如下：

```
每步循环（以步骤 N 为例，stepId = N）：
  1. 告知主流程："开始执行 Step N: [名称]"
  2. 📐 **预先声明**：从 plan.json 读取本步骤的 files 列表，列出本步骤计划创建/修改的所有文件
  3. 📐 **预先校验（脚本强制）**：
     a. 工作区洁净检查：使用 `git status --porcelain` 检查当前工作区是否干净（确保无遗留变更）
        - ✅ 干净 → 继续
        - ❌ 有未提交变更 → 判断变更来源：
          - 属于上一步骤的残留 → 询问用户是否丢弃（`git checkout --` / `git restore`）
          - 属于被 `.gitignore` 忽略的文件 → 自动跳过
          - 无法判断 → 告知主流程并暂停
     b. 文件范围校验：调用 `node scripts/workflow.mjs check-scope <statePath> <file1> [file2...]`
        - 脚本自动豁免 `.ai-coding/` 路径和被 `.gitignore` 匹配的路径
        - 其他路径必须落在 `state.json.plan.allowedPaths` 范围内
        - 退出码 0 = 全部在范围；退出码 1 = 存在越界
        - ❌ 越界 → 告知主流程并停止，说明越界文件详情
  4. 📸 **执行前快照（脚本强制）**：调用 `node scripts/workflow.mjs snapshot-before <statePath> <stepId> <file1> [file2...]`
     - 脚本将本步骤涉及文件的 hash 快照写入 `{evidence.dir}/{stepId}-before.json`
  5. 实现：编写代码实现该步骤的目标
  6. 📐 **实现后校验（脚本强制）**：使用 `git status --porcelain` 获取实际变更文件，再次调用 `check-scope` 校验
     - ✅ 全部在范围内 → 继续
     - ❌ 存在越界 → 回退越界文件（git restore 或 git checkout --），告知主流程
  7. 🔍 **分层验证**（按"编译/Lint 自动检测"规则匹配命令）：
     - ① 编译/类型检查（如 tsc --noEmit、go build、cargo check）
     - ② Linter 检查（如 eslint、staticcheck、cargo clippy）
     - 每条验证命令调用 `node scripts/workflow.mjs run-verify [--cwd <dir>] <command...>` 执行
       - 脚本透传退出码：0 = 通过，非 0 = 失败（输出存档到 `{evidence.dir}/{stepId}-result.json`）
     - 无编译步骤的语言自动跳过；无 linter 配置时自动跳过
  8. ✅ **运行测试**（按"测试命令自动检测"规则匹配项目测试命令）：
     - 调用 `node scripts/workflow.mjs run-verify [--cwd <dir>] <test-command...>` 执行
     - ✅ 通过（退出码 0）→ 继续下一步
     - ❌ 失败（退出码非 0）→ 停止并向主流程报告失败详情（准确定位到问题步骤）
  9. 📸 **执行后证据（脚本强制）**：调用 `node scripts/workflow.mjs snapshot-after <statePath> <stepId>`
     - 脚本对比 step 的 before/after hash，生成 diff patch 写入 `{evidence.dir}/{stepId}-after.patch`
  10. Git 提交：git commit，提交信息采用 Conventional Commits 格式：
      <type>: <≤50字中文描述>
      type 取值为 feat / fix / refactor / test / docs / chore，根据实际变更类型选择
      示例：feat: 添加用户登录接口
            fix: 修复 token 过期未处理的问题
            refactor: 提取通用 auth 中间件
  11. **状态流转（脚本强制）**：调用 `node scripts/workflow.mjs transition <statePath> executing --current-step N`
      - 脚本原子更新 `status: "executing"`、`currentStep: N`、`updatedAt`
      - step 字段在整个执行阶段保持为 5（不传 --step 则保持不变）
  12. 告知主流程："Step N 完成 ✅"
```

> **受保护步骤（guarded）**：若 `plan.json` 中某步骤的 `risk` 字段为 `"guarded"`，Execution 在第 5 步实现前应先暂停并请求人工确认（涉及敏感文件如配置、迁移脚本、CI 等），确认后再继续。

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

整个流程支持断点恢复。启动时，主流程通过脚本扫描和恢复：

1. **扫描未完成任务**：调用 `node scripts/workflow.mjs list-tasks <workDir>`（`<workDir>` 为目标项目根目录）
   - 脚本扫描 `.ai-coding/temp/` 下所有 `{vId}` 子目录，过滤出 `status` 非 `accepted` / `completed` 的任务
   - 输出每个任务的 `vId` / `name` / `status` / `step` / `updatedAt`
2. 如果**输出为空**（不存在任何未完成子目录）→ 正常启动新工作流
3. 如果**存在未完成任务**：
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
   - **1 继续** → 调用 `node scripts/workflow.mjs resume <statePath>` 获取下一步动作指引
     - 脚本输出包含 `resumePoint`（恢复点）和 `nextAction`（下一步动作建议），主流程据此跳转：
     - `waitingFor: "user_supplement"` → 从对应的补充信息环节继续，提示用户输入补充信息
     - `waitingFor` 为 `null` 或不存在 → 根据 `status` 正常跳转
     - `spec_reviewing` → 检测 `.ai-coding/temp/{vId}/spec-suggest.md` 是否存在且有实质性问题：
       - 是 → 从 Step **3.2 AI 校验循环**继续（启动 spec-generator 修补 spec.json，重新渲染 spec.md）
       - 否 → 从 Step **3.3 用户确认**继续（校验已完成，直接展示确认界面）
     - `spec_confirming` → 从 Step 3.3 用户确认继续
     - `plan_reviewing` → 检测 `.ai-coding/temp/{vId}/plan-suggest.md` 是否存在且有实质性问题：
       - 是 → 从 Step **4.2 AI 校验循环**继续（启动 plan-generator 修补 plan.json，重新渲染 plan.md）
       - 否 → 从 Step **4.3 用户确认**继续（校验已完成，直接展示确认界面）
     - `plan_confirming` → 从 Step 4.3 用户确认继续
     - `executing` → 从 Step 5 继续：
       1. 读取 `plan.json`，定位到 `currentStep + 1` 步骤的内容
       2. 检查工作区状态：
          - 工作区干净 → 正常从 `currentStep + 1` 开始执行
          - 有未提交变更（上次中断遗留） → 判断变更是否属于当前步骤的预期工作：
            - 是 → 保留变更，继续完成该步骤
            - 否 → 询问用户是否丢弃遗留变更
       3. 重新启动 Execution，传递恢复上下文信息
       如果 `currentStep` 为空（未完成任何步骤就中断），从 Step 1 开始
     - `acceptance` → 从 Step 5 验收继续
   - **2 丢弃** → 删除对应的 `.ai-coding/temp/{vId}/` 目录，正常启动新工作流

## 脚本命令参考

所有脚本位于 skill 仓库根的 `scripts/` 目录下，零依赖（仅用 Node.js 内置模块）。**脚本路径相对于 skill 仓库根，但执行时的工作目录是目标项目根**。所有命令通过退出码判定结果：`0` = 通过/成功，`1` = 不通过/失败（部分命令除外，见下文）。

### workflow.mjs — 核心脚本强制层

```
node scripts/workflow.mjs init <workDir> <name>
```
初始化 state.json，自动生成 `date`（YYYYMMDD）和 `hash`（6位随机），构造 `vId = {name}_{date}_{hash}`，创建 `.ai-coding/temp/{vId}/`、`.ai-coding/history/`、`.ai-coding/temp/{vId}/evidence/` 目录，原子写入 state.json（含 `version: 1`、`status: "initialized"`、`evidence.dir` 等字段）。

```
node scripts/workflow.mjs load-state <statePath>
```
加载并输出 state.json（含 `version` 版本校验）。退出码 0 = 加载成功，非 0 = 文件缺失或版本不兼容。

```
node scripts/workflow.mjs require-state <statePath> <status1> [status2...]
```
校验当前 `status` 是否在允许列表中。退出码 0 = 通过（当前状态在列表中），1 = 不通过。

```
node scripts/workflow.mjs transition <statePath> <newStatus> [--step N] [--current-step N] [--waiting <value>]
```
状态流转：校验 `oldStatus → newStatus` 合法性 + 原子写入。可选参数：
- `--step N`：更新 `step` 字段为大阶段编号
- `--current-step N`：更新 `currentStep` 字段为 plan 步骤序号
- `--waiting <value>`：设置 `waitingFor` 字段（传 `null` 清除）
退出码 0 = 流转成功，1 = 非法流转或写入失败。

```
node scripts/workflow.mjs check-scope <statePath> <file1> [file2...]
```
文件范围校验：检查传入的文件路径是否全部落在 `state.json.plan.allowedPaths` 范围内。**`.ai-coding/` 开头的路径和被项目 `.gitignore` 匹配的路径自动豁免**。退出码 0 = 全部在范围内，1 = 存在越界。

```
node scripts/workflow.mjs run-verify [--cwd <dir>] <command...>
```
执行验证命令并透传退出码。`--cwd` 指定工作目录（默认当前目录），`<command...>` 为要执行的命令及其参数（多参数空格分隔）。退出码 = 子进程退出码（0 = 通过，非 0 = 失败），输出存档到 `{evidence.dir}/{stepId}-result.json`（如配置了 evidence 目录）。

```
node scripts/workflow.mjs snapshot-before <statePath> <stepId> <file1> [file2...]
```
执行步骤前采集文件 hash 快照，写入 `{evidence.dir}/{stepId}-before.json`。退出码 0 = 成功，1 = 失败。

```
node scripts/workflow.mjs snapshot-after <statePath> <stepId>
```
执行步骤后生成 diff patch 证据：对比同 `stepId` 的 before 快照，写入 `{evidence.dir}/{stepId}-after.patch`。退出码 0 = 成功，1 = 失败。

```
node scripts/workflow.mjs list-tasks <workDir>
```
列出所有活跃任务（`status` 非 `accepted` / `completed`）。输出每个任务的 `vId` / `name` / `status` / `step` / `updatedAt`。退出码 0 = 成功。

```
node scripts/workflow.mjs resume <statePath>
```
恢复中断任务：输出 `resumePoint`（恢复点标识）和 `nextAction`（下一步动作建议），主流程据此跳转到对应步骤。退出码 0 = 成功。

```
node scripts/workflow.mjs help
```
显示帮助信息。

### validate.mjs — JSON Schema 校验器

```
node scripts/validate.mjs state <statePath>
node scripts/validate.mjs spec <specPath>
node scripts/validate.mjs plan <planPath>
```
校验 JSON 是否符合对应 schema（`assets/schema/{state,spec,plan}.schema.json`）。退出码 0 = 通过，1 = 校验失败（错误详情输出到 stderr）。

### render.mjs — JSON → Markdown 渲染器

```
node scripts/render.mjs spec <jsonPath> <outputPath>
node scripts/render.mjs plan <jsonPath> <outputPath>
```
将 JSON 渲染为 Markdown 视图，写入 `<outputPath>`。退出码 0 = 成功，1 = 失败。**渲染产物是 Markdown 视图，禁止手改**；任何修改必须作用于 JSON 事实来源，再重新渲染。

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

## Claude Code 适配：Task 工具角色隔离

> 本节适用于 Claude Code 环境。Codex 环境跳过本节，按前述 prompt 角色切换方式执行。

### 问题与方案

Codex 无原生子 Agent 工具，双角色协作通过 prompt 指令让同一 AI 在不同轮次扮演不同角色实现——这会导致"既当裁判又当运动员"：同一大脑的知识盲区和推理惯性完全相同，reviewer 遗漏的东西和 generator 遗漏的东西高度重叠。

Claude Code 拥有 **Task 工具**，可启动**独立上下文**的子 Agent。本 skill 利用此能力实现角色间的物理隔离：

| 维度 | Codex（prompt 切换） | Claude Code（Task 隔离） |
|------|-------------------|----------------------|
| 上下文 | 共享，角色间可见 | **独立**，子 Agent 看不到父对话 |
| 盲审 | prompt 层面"装作"盲审 | **天然盲审**，reviewer 看不到 generator 的思考过程 |
| 知识盲区 | 完全重叠 | 部分隔离 |
| 争议仲裁 | 无第三方 | 可启动第三个 Task 做仲裁 |

### 角色与 Task 映射

| 角色 | subagent_type | 职责 |
|------|--------------|------|
| spec-generator | `general_purpose_task` | 读取需求和上下文，生成 spec.json |
| spec-reviewer | `general_purpose_task` | 审查 spec.md，输出 spec-suggest.md |
| plan-generator | `general_purpose_task` | 读取 spec.json，生成 plan.json |
| plan-reviewer | `general_purpose_task` | 审查 plan.md，输出 plan-suggest.md |
| execution | `general_purpose_task` | 按 plan.json 逐步执行代码变更 |
| moderator（可选） | `general_purpose_task` | 仲裁 generator 与 reviewer 的争议 |

> 所有子 Agent 均在独立上下文中执行。主流程通过文件（spec.json / spec-suggest.md 等）和返回值与子 Agent 通信，不共享对话历史。

### Task 调用通用模板

主流程在每个角色启动点，使用 Task 工具启动子 Agent：

```
Task(
  subagent_type: "general_purpose_task",
  description: "<角色名>",
  query: "
    你是 {角色名}。
    上下文：{必要的文件路径和需求摘要}
    任务：{具体任务描述}
    审查标准/约束：{引用 references/review-*.md 的相关内容}
    输出：{写入哪个文件，返回什么摘要}
    注意：你在一个独立上下文中工作，看不到其他角色的思考过程。
          以第一次审查的心态独立工作，每个结论必须基于证据。
  "
)
```

> **关键原则**：
> - query 中只传递**必要的文件路径和需求摘要**，不传递其他角色的对话历史或思考过程
> - reviewer 的 query 中**不包含** generator 的身份信息和生成过程说明
> - 子 Agent 完成后返回简短摘要（如"发现 2 个 P0 问题，3 个 P1 问题"），主流程通过读取文件获取详细内容

### 争议仲裁（moderator）

当 generator（修补模式）与 reviewer 对某个问题存在分歧时，主流程可启动 moderator 子 Agent：

```
Task(
  subagent_type: "general_purpose_task",
  description: "仲裁审查争议",
  query: "
    你是 moderator，不参与生成也不参与审查，只做仲裁。
    争议项：{reviewer 提出的 P0/P1 问题}
    被异议方理由：{generator 的拒绝理由}
    审查标准：读取 references/review-spec.md（或 review-plan.md）
    请基于标准做最终裁决：
      1. 采纳 reviewer（generator 必须修）
      2. 采纳 generator（reviewer 误判）
      3. 折中方案
    输出裁决结论和理由。
  "
)
```

> moderator 为可选机制，仅在 generator 明确拒绝 reviewer 的 P0/P1 建议且双方无法达成一致时启用。

## 使用示例

**用户输入：**
> 我想给这个项目加一个用户登录功能，用 JWT token，不需要注册页面，直接用预设账号登录。

**skill 应当：**

1. 复述需求并澄清
2. 初始化：生成 name="登录功能"，调用脚本自动生成 vId（如 "登录功能_20260806_a3f2b1"）
3. 生成 spec，经用户确认通过后保存到 `.ai-coding/temp/{vId}/`
4. 生成 plan，经用户确认通过后保存到同目录
5. 逐个执行 plan 步骤，每步按 Conventional Commits 格式提交（如 `feat: 添加登录接口`）
6. 执行完成提示用户验收
7. 验收通过后，将文件夹归档至 `.ai-coding/history/{vId}/`
8. 询问是否推送
