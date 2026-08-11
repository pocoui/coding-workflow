#!/usr/bin/env node

/**
 * ai-coding-workflow 核心脚本强制层
 *
 * 将关键约束（状态流转、文件范围、验证执行、证据采集）从 prompt 指令约束
 * 升级为机器级强制。AI 通过调用本脚本完成受控操作。
 *
 * 零依赖，仅用 Node.js 内置模块。
 * 所有命令输出 JSON 到 stdout（便于 AI 解析），错误输出到 stderr。
 */

import { readFile, writeFile, mkdir, readdir, stat, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ─── 常量 ─────────────────────────────────────────────────────────────────

const STATE_VERSION = 1;

const MODES = ['fast', 'standard', 'strict'];

const REVIEW_BY_MODE = {
  fast: { maxSpecRounds: 0, maxPlanRounds: 0, maxCodeRounds: 1 },
  standard: { maxSpecRounds: 1, maxPlanRounds: 1, maxCodeRounds: 1 },
  strict: { maxSpecRounds: 3, maxPlanRounds: 3, maxCodeRounds: 3 },
};

/** 合法状态流转映射：from → [allowed to...] */
const TRANSITIONS = {
  initialized: ['spec_reviewing', 'plan_confirming'],
  spec_reviewing: ['spec_confirming', 'initialized'],
  spec_confirming: ['plan_reviewing', 'spec_reviewing'],
  plan_reviewing: ['plan_confirming', 'spec_confirming'],
  plan_confirming: ['executing', 'plan_reviewing'],
  executing: ['code_reviewing', 'plan_confirming'],
  code_reviewing: ['acceptance', 'executing'],
  acceptance: ['accepted', 'executing'],
  accepted: ['completed'],
  completed: [],
};

/** 始终豁免文件范围校验的路径前缀 */
const ALWAYS_EXEMPT = ['.ai-coding/'];

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/** 标准化路径：反斜杠转正斜杠，去除前导 ./ */
function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** 判断路径是否以某前缀开头（路径用 / 分隔） */
function startsWithPath(filePath, prefix) {
  const f = normalizePath(filePath);
  const p = normalizePath(prefix);
  if (f === p) return true;
  // 目录前缀匹配：prefix 以 / 结尾，或 f 以 prefix + / 开头
  if (p.endsWith('/')) return f.startsWith(p);
  return f.startsWith(p + '/');
}

/** 原子写入 JSON 文件（tmp + rename，防中断损坏） */
async function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

/** 读取并解析 JSON 文件 */
async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

/** 获取当前 ISO 时间戳 */
function now() {
  return new Date().toISOString();
}

/** 输出 JSON 到 stdout */
function output(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/** 输出错误到 stderr 并以非 0 退出 */
function fail(message, code = 1) {
  process.stderr.write(`[workflow] ${message}\n`);
  process.exit(code);
}

/** 计算文件 SHA-256 */
async function fileHash(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/** 用 git check-ignore 检测路径是否被 .gitignore 忽略 */
function isGitIgnored(filePath, cwd) {
  const result = spawnSync('git', ['check-ignore', '-q', filePath], { cwd: cwd || process.cwd() });
  // 退出码 0 表示被忽略，1 表示未忽略
  return result.status === 0;
}

// ─── 文件范围校验 ──────────────────────────────────────────────────────────

/**
 * 校验文件是否在 allowedPaths 范围内
 * @param {string[]} files - 待校验文件列表
 * @param {string[]} allowedPaths - 允许的路径列表
 * @param {string} cwd - 项目根目录（用于 git check-ignore）
 * @returns {{ allowed: string[], outOfScope: string[], exempt: string[] }}
 */
function checkFilesInScope(files, allowedPaths, cwd) {
  const allowed = [];
  const outOfScope = [];
  const exempt = [];

  for (const f of files) {
    const norm = normalizePath(f);

    // 1. 始终豁免：.ai-coding/ 前缀
    if (ALWAYS_EXEMPT.some((p) => norm.startsWith(p))) {
      exempt.push(f);
      continue;
    }

    // 2. .gitignore 豁免
    if (isGitIgnored(norm, cwd)) {
      exempt.push(f);
      continue;
    }

    // 3. allowedPaths 范围匹配
    if (allowedPaths.some((ap) => startsWithPath(norm, ap))) {
      allowed.push(f);
    } else {
      outOfScope.push(f);
    }
  }

  return { allowed, outOfScope, exempt };
}

// ─── 命令实现 ──────────────────────────────────────────────────────────────

/**
 * init - 初始化 state.json
 * 用法: workflow.mjs init <workDir> <name>
 * 脚本自动生成 date（YYYYMMDD）和 hash（6位随机），构造 vId = {name}_{date}_{hash}
 */
async function cmdInit(args) {
  const [workDir, name] = args;
  const flags = parseFlags(args.slice(2));
  const mode = flags.mode || 'standard';
  if (!MODES.includes(mode)) {
    fail(`invalid mode: ${mode} (expected: ${MODES.join(', ')})`);
  }
  if (!workDir || !name) {
    fail('用法: init <workDir> <name>');
  }

  // 自动生成日期和哈希
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const hash = randomBytes(3).toString('hex'); // 6 位小写 hex
  const vId = `${name}_${date}_${hash}`;

  const tempDir = join(workDir, '.ai-coding', 'temp', vId);
  const historyDir = join(workDir, '.ai-coding', 'history');
  const evidenceDir = join(tempDir, 'evidence');
  const statePath = join(tempDir, 'state.json');

  // 创建目录
  await mkdir(tempDir, { recursive: true });
  await mkdir(historyDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });

  const timestamp = now.toISOString();
  const state = {
    version: STATE_VERSION,
    vId,
    name,
    date,
    hash,
    step: 2,
    status: 'initialized',
    createdAt: timestamp,
    updatedAt: timestamp,
    mode,
    specPath: `.ai-coding/temp/${vId}/spec.md`,
    planPath: `.ai-coding/temp/${vId}/plan.md`,
    briefPath: `.ai-coding/temp/${vId}/brief.md`,
    currentStep: null,
    waitingFor: null,
    review: {
      ...REVIEW_BY_MODE[mode],
      specRounds: 0,
      planRounds: 0,
      codeRounds: 0,
    },
    plan: { allowedPaths: [] },
    evidence: { dir: `.ai-coding/temp/${vId}/evidence` },
  };

  await atomicWriteJson(statePath, state);
  output({ ok: true, statePath: relative(workDir, statePath), state });
}

/**
 * load-state - 加载并输出 state.json
 * 用法: workflow.mjs load-state <statePath>
 */
async function cmdLoadState(args) {
  const [statePath] = args;
  if (!statePath) fail('用法: load-state <statePath>');

  if (!existsSync(statePath)) {
    fail(`状态文件不存在: ${statePath}`);
  }

  const state = await readJson(statePath);

  // 版本校验
  if (state.version !== STATE_VERSION) {
    fail(`state.json 版本不兼容: 期望 ${STATE_VERSION}, 实际 ${state.version}`);
  }

  output({ ok: true, state });
}

/**
 * require-state - 校验当前状态是否在允许列表中
 * 用法: workflow.mjs require-state <statePath> <status1> [status2...]
 * 退出码 0=通过, 1=不通过
 */
async function cmdRequireState(args) {
  const [statePath, ...allowedStatuses] = args;
  if (!statePath || allowedStatuses.length === 0) {
    fail('用法: require-state <statePath> <status1> [status2...]');
  }

  const state = await readJson(statePath);
  const current = state.status;

  if (allowedStatuses.includes(current)) {
    output({ ok: true, status: current });
  } else {
    output({ ok: false, status: current, allowed: allowedStatuses });
    process.exit(1);
  }
}

/**
 * transition - 状态流转（校验合法性 + 原子写入）
 * 用法: workflow.mjs transition <statePath> <newStatus> [--step N] [--current-step N] [--extra <json>]
 */
async function cmdTransition(args) {
  const [statePath, newStatus] = args;
  if (!statePath || !newStatus) {
    fail('用法: transition <statePath> <newStatus> [--step N] [--current-step N]');
  }

  const state = await readJson(statePath);
  const fromStatus = state.status;

  // 校验流转合法性
  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(newStatus)) {
    fail(`非法状态流转: ${fromStatus} → ${newStatus}（允许: ${allowed.join(', ') || '无'}）`);
  }

  // 解析可选参数
  const flags = parseFlags(args.slice(2));

  // 更新状态
  state.status = newStatus;
  state.updatedAt = now();
  if (flags.step !== undefined) state.step = parseInt(flags.step, 10);
  if (flags['current-step'] !== undefined) state.currentStep = parseInt(flags['current-step'], 10);
  if (flags.waiting !== undefined) {
    state.waitingFor = flags.waiting === 'null' ? null : flags.waiting;
  }

  await atomicWriteJson(statePath, state);
  output({ ok: true, from: fromStatus, to: newStatus, state });
}

/**
 * check-scope - 文件范围校验
 * 用法: workflow.mjs check-scope <statePath> <file1> [file2...]
 */
async function cmdCheckScope(args) {
  const [statePath, ...files] = args;
  if (!statePath || files.length === 0) {
    fail('用法: check-scope <statePath> <file1> [file2...]');
  }

  const state = await readJson(statePath);
  const allowedPaths = state.plan?.allowedPaths || [];
  const cwd = dirname(resolve(statePath, '..', '..')); // 项目根 = statePath 上两级

  const result = checkFilesInScope(files, allowedPaths, cwd);

  output({
    ok: result.outOfScope.length === 0,
    allowed: result.allowed,
    exempt: result.exempt,
    outOfScope: result.outOfScope,
    allowedPaths,
  });

  if (result.outOfScope.length > 0) {
    process.exit(1);
  }
}

/**
 * run-verify - 执行验证命令并判定退出码
 * 用法: workflow.mjs run-verify <command...>
 */
async function cmdSetAllowedPaths(args) {
  const [statePath, ...paths] = args;
  if (!statePath || paths.length === 0) {
    fail('usage: set-allowed-paths <statePath> <file-or-dir> [file-or-dir...]');
  }

  const state = await readJson(statePath);
  const merged = new Set([...(state.plan?.allowedPaths || []), ...paths.map(normalizePath)]);
  state.plan = state.plan || {};
  state.plan.allowedPaths = [...merged].sort();
  state.updatedAt = now();

  await atomicWriteJson(statePath, state);
  output({ ok: true, allowedPaths: state.plan.allowedPaths, state });
}

async function cmdBumpReview(args) {
  const [statePath, kind] = args;
  if (!statePath || !kind) {
    fail('usage: bump-review <statePath> <spec|plan|code>');
  }

  const keyByKind = {
    spec: ['specRounds', 'maxSpecRounds'],
    plan: ['planRounds', 'maxPlanRounds'],
    code: ['codeRounds', 'maxCodeRounds'],
  };
  const keys = keyByKind[kind];
  if (!keys) {
    fail(`invalid review kind: ${kind} (expected: spec, plan, code)`);
  }

  const state = await readJson(statePath);
  const mode = MODES.includes(state.mode) ? state.mode : 'standard';
  state.mode = mode;
  state.review = {
    ...REVIEW_BY_MODE[mode],
    specRounds: 0,
    planRounds: 0,
    codeRounds: 0,
    ...(state.review || {}),
  };

  const [roundKey, maxKey] = keys;
  const currentRounds = Number(state.review[roundKey] || 0);
  const maxRounds = Number(state.review[maxKey] ?? REVIEW_BY_MODE[mode][maxKey]);
  const nextRounds = currentRounds + 1;
  state.review[roundKey] = nextRounds;
  state.updatedAt = now();

  await atomicWriteJson(statePath, state);
  output({
    ok: true,
    kind,
    mode,
    rounds: nextRounds,
    maxRounds,
    canContinue: nextRounds < maxRounds,
    limitReached: nextRounds >= maxRounds,
    state,
  });
}

async function cmdRunVerify(args) {
  if (args.length === 0) fail('用法: run-verify <command...>');

  // 解析命令（支持 --cwd <dir>）
  let cwd = process.cwd();
  const cmdArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else {
      cmdArgs.push(args[i]);
    }
  }

  if (cmdArgs.length === 0) fail('未提供验证命令');

  const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: 300000, // 5 分钟超时
  });

  const ok = result.status === 0;
  output({
    ok,
    exitCode: result.status,
    stdout: (result.stdout || '').slice(-4000), // 截断避免过长
    stderr: (result.stderr || '').slice(-4000),
    command: cmdArgs.join(' '),
  });

  if (!ok) process.exit(1);
}

/**
 * snapshot-before - 执行步骤前采集文件快照
 * 用法: workflow.mjs snapshot-before <statePath> <stepId> <file1> [file2...]
 */
async function cmdSnapshotBefore(args) {
  const [statePath, stepId, ...files] = args;
  if (!statePath || !stepId || files.length === 0) {
    fail('用法: snapshot-before <statePath> <stepId> <file1> [file2...]');
  }

  const state = await readJson(statePath);
  const evidenceDir = state.evidence?.dir
    ? join(process.cwd(), state.evidence.dir)
    : join(dirname(statePath), 'evidence');

  await mkdir(evidenceDir, { recursive: true });

  // 采集文件 hash
  const hashes = {};
  for (const f of files) {
    const fullPath = join(process.cwd(), normalizePath(f));
    if (existsSync(fullPath)) {
      try {
        hashes[normalizePath(f)] = await fileHash(fullPath);
      } catch {
        hashes[normalizePath(f)] = null; // 文件可能不存在（新增文件）
      }
    } else {
      hashes[normalizePath(f)] = null; // 标记为新增
    }
  }

  const evidence = {
    stepId: parseInt(stepId, 10),
    timestamp: now(),
    type: 'before',
    fileHashes: hashes,
  };

  const evidencePath = join(evidenceDir, `${stepId}-before.json`);
  await atomicWriteJson(evidencePath, evidence);
  output({ ok: true, evidencePath: relative(process.cwd(), evidencePath), fileCount: files.length });
}

/**
 * snapshot-after - 执行步骤后生成 diff patch
 * 用法: workflow.mjs snapshot-after <statePath> <stepId>
 */
async function cmdSnapshotAfter(args) {
  const [statePath, stepId] = args;
  if (!statePath || !stepId) {
    fail('用法: snapshot-after <statePath> <stepId>');
  }

  const state = await readJson(statePath);
  const evidenceDir = state.evidence?.dir
    ? join(process.cwd(), state.evidence.dir)
    : join(dirname(statePath), 'evidence');

  await mkdir(evidenceDir, { recursive: true });

  // 生成 git diff patch（未暂存的变更）
  const cwd = process.cwd();
  const diffResult = spawnSync('git', ['diff', 'HEAD'], { cwd, encoding: 'utf8' });
  const diffPatch = diffResult.stdout || '';

  // 生成 commit 记录
  const logResult = spawnSync('git', ['log', '--oneline', '-1'], { cwd, encoding: 'utf8' });
  const lastCommit = (logResult.stdout || '').trim();

  const evidence = {
    stepId: parseInt(stepId, 10),
    timestamp: now(),
    type: 'after',
    lastCommit,
    diffSize: diffPatch.length,
  };

  const evidencePath = join(evidenceDir, `${stepId}-after.json`);
  await atomicWriteJson(evidencePath, evidence);

  // 写 diff patch
  const patchPath = join(evidenceDir, `${stepId}-after.patch`);
  if (diffPatch) {
    await writeFile(patchPath, diffPatch, 'utf8');
  }

  output({
    ok: true,
    evidencePath: relative(cwd, evidencePath),
    patchPath: diffPatch ? relative(cwd, patchPath) : null,
    diffSize: diffPatch.length,
  });
}

/**
 * list-tasks - 列出所有活跃任务（.ai-coding/temp/ 下的未完成任务）
 * 用法: workflow.mjs list-tasks <workDir>
 */
async function cmdListTasks(args) {
  const [workDir] = args;
  if (!workDir) fail('用法: list-tasks <workDir>');

  const tempDir = join(workDir, '.ai-coding', 'temp');
  if (!existsSync(tempDir)) {
    output({ ok: true, tasks: [] });
    return;
  }

  const entries = await readdir(tempDir, { withFileTypes: true });
  const tasks = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statePath = join(tempDir, entry.name, 'state.json');
    if (!existsSync(statePath)) continue;

    try {
      const state = await readJson(statePath);
      if (state.status !== 'accepted' && state.status !== 'completed') {
        tasks.push({
          vId: state.vId,
          name: state.name,
          mode: state.mode || 'standard',
          status: state.status,
          step: state.step,
          currentStep: state.currentStep,
          updatedAt: state.updatedAt,
          waitingFor: state.waitingFor,
        });
      }
    } catch {
      // 跳过损坏的 state.json
    }
  }

  // 按更新时间倒序
  tasks.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  output({ ok: true, count: tasks.length, tasks });
}

/**
 * resume - 恢复中断任务，输出下一步动作指引
 * 用法: workflow.mjs resume <statePath>
 */
async function cmdResume(args) {
  const [statePath] = args;
  if (!statePath) fail('用法: resume <statePath>');

  const state = await readJson(statePath);
  const status = state.status;
  const waitingFor = state.waitingFor;

  let nextAction = '';
  let resumePoint = '';

  if (waitingFor === 'user_supplement') {
    nextAction = '等待用户补充信息';
    resumePoint = '补充信息环节';
  } else {
    const resumeMap = {
      initialized: { point: 'Step 3.1', action: '启动 spec-generator 生成 spec' },
      spec_reviewing: { point: 'Step 3.2', action: '检查 spec-suggest.md，继续校验循环或进入用户确认' },
      spec_confirming: { point: 'Step 3.3', action: '展示 spec 确认界面' },
      plan_reviewing: { point: 'Step 4.2', action: '检查 plan-suggest.md，继续校验循环或进入用户确认' },
      plan_confirming: { point: 'Step 4.3', action: '展示 plan 确认界面' },
      executing: { point: 'Step 5', action: `从 Step ${state.currentStep + 1} 继续执行` },
      code_reviewing: { point: 'Step 5.3', action: '检查 code-suggest.md，继续代码审查或进入验收' },
      acceptance: { point: 'Step 5 验收', action: '展示验收界面' },
      accepted: { point: 'Step 6', action: '询问是否推送' },
      completed: { point: '已完成', action: '无' },
    };
    const info = resumeMap[status] || { point: '未知', action: '未知状态' };
    resumePoint = info.point;
    nextAction = info.action;
  }

  output({
    ok: true,
    vId: state.vId,
    name: state.name,
    mode: state.mode || 'standard',
    status,
    step: state.step,
    currentStep: state.currentStep,
    waitingFor,
    resumePoint,
    nextAction,
    updatedAt: state.updatedAt,
  });
}

/**
 * help - 显示帮助
 */
function cmdHelp() {
  const help = `
ai-coding-workflow 核心脚本强制层

用法: node scripts/workflow.mjs <command> [args...]

命令:
  init <workDir> <name>
    初始化 state.json，自动生成 date（YYYYMMDD）和 hash（6位随机），
    构造 vId = {name}_{date}_{hash}，创建运行时目录与证据目录

  load-state <statePath>
    加载并输出 state.json（含版本校验）

  require-state <statePath> <status1> [status2...]
    校验当前状态是否在允许列表中（退出码 0=通过, 1=不通过）

  transition <statePath> <newStatus> [--step N] [--current-step N] [--waiting <value>]
    状态流转（校验合法性 + 原子写入）

  check-scope <statePath> <file1> [file2...]
    文件范围校验（.ai-coding/ 和 .gitignore 自动豁免）

  run-verify [--cwd <dir>] <command...>
    执行验证命令并判定退出码

  snapshot-before <statePath> <stepId> <file1> [file2...]
    执行步骤前采集文件 hash 快照

  snapshot-after <statePath> <stepId>
    执行步骤后生成 diff patch 证据

  list-tasks <workDir>
    列出所有活跃任务（未完成）

  resume <statePath>
    恢复中断任务，输出下一步动作指引

  help
    显示本帮助
`;
  process.stdout.write(help + '\n');
}

// ─── 辅助：解析 --flag 参数 ─────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = val;
    }
  }
  return flags;
}

// ─── 入口 ──────────────────────────────────────────────────────────────────

const COMMANDS = {
  init: cmdInit,
  'load-state': cmdLoadState,
  'save-state': null, // save-state 由 transition 封装，不单独暴露
  'require-state': cmdRequireState,
  transition: cmdTransition,
  'check-scope': cmdCheckScope,
  'set-allowed-paths': cmdSetAllowedPaths,
  'bump-review': cmdBumpReview,
  'run-verify': cmdRunVerify,
  'snapshot-before': cmdSnapshotBefore,
  'snapshot-after': cmdSnapshotAfter,
  'list-tasks': cmdListTasks,
  resume: cmdResume,
  help: cmdHelp,
};

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help') {
    cmdHelp();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    fail(`未知命令: ${command}（输入 help 查看可用命令）`);
  }

  try {
    await handler(args);
  } catch (err) {
    if (err.code === 'ENOENT') {
      fail(`文件不存在: ${err.path}`);
    }
    fail(err.message || String(err));
  }
}

main();
