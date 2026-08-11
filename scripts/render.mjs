#!/usr/bin/env node

/**
 * ai-coding-workflow 视图渲染器
 *
 * 将 JSON 事实来源（spec.json / plan.json）渲染为人类可读的 Markdown 视图。
 * Markdown 视图由脚本生成，禁止手改。
 *
 * 用法:
 *   node scripts/render.mjs spec <jsonPath> <outputPath>
 *   node scripts/render.mjs plan <jsonPath> <outputPath>
 *   node scripts/render.mjs brief <jsonPath> <outputPath>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

// ─── 通用渲染辅助 ──────────────────────────────────────────────────────────

/**
 * 渲染结构化文本，兼容 string 和 { summary, details } 两种格式
 */
function renderStructuredText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value; // 向后兼容：纯 string
  const parts = [];
  if (value.summary) parts.push(value.summary);
  if (value.details && value.details.length > 0) {
    parts.push(value.details.map(d => `- ${d}`).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * 渲染约束列表
 */
function renderConstraints(constraints) {
  if (!constraints || constraints.length === 0) return '';
  const typeLabel = {
    technical: '技术约束',
    business: '业务规则',
    compatibility: '兼容性',
    security: '安全',
    performance: '性能',
  };
  const lines = [];
  for (const c of constraints) {
    lines.push(`- **${typeLabel[c.type] || c.type}**：${c.description}`);
  }
  return lines.join('\n');
}

// ─── Spec 渲染 ─────────────────────────────────────────────────────────────

function renderSpec(spec) {
  const lines = [];

  lines.push(`# ${spec.title}`, '');
  lines.push('> 本文档由 spec.json 渲染生成，请勿手动修改。修改请编辑 spec.json 后重新渲染。', '');
  lines.push('---', '');

  // 背景与目标
  lines.push('## 背景与目标', '');
  lines.push('### 背景', '');
  lines.push(renderStructuredText(spec.background), '');
  lines.push('### 目标', '');
  lines.push(renderStructuredText(spec.goal), '');

  // 范围
  if (spec.scope) {
    lines.push('## 范围', '');
    if (spec.scope.summary) lines.push(spec.scope.summary, '');
    lines.push('### 包含', '');
    for (const item of spec.scope.inScope) lines.push(`- ${item}`);
    lines.push('');
    if (spec.scope.outOfScope && spec.scope.outOfScope.length > 0) {
      lines.push('### 不包含', '');
      for (const item of spec.scope.outOfScope) lines.push(`- ${item}`);
      lines.push('');
    }
  }

  // 用户场景
  if (spec.userScenarios && spec.userScenarios.length > 0) {
    lines.push('## 用户场景', '');
    for (const us of spec.userScenarios) {
      lines.push(`- 作为**${us.role}**，我希望能**${us.action}**，以便**${us.goal}**`);
    }
    lines.push('');
  }

  // 约束
  if (spec.constraints && spec.constraints.length > 0) {
    lines.push('## 约束与假设', '');
    lines.push(renderConstraints(spec.constraints), '');
    lines.push('');
  }

  // 功能规格
  lines.push('## 功能规格', '');
  for (const feat of spec.features) {
    lines.push(`### ${feat.name}`, '');
    lines.push(renderStructuredText(feat.description), '');
    if (feat.userScenario) lines.push(`**关联场景**: ${feat.userScenario}`, '');
    if (feat.inputs) lines.push(`**输入**: ${feat.inputs}`, '');
    if (feat.outputs) lines.push(`**输出**: ${feat.outputs}`, '');
    if (feat.edgeCases && feat.edgeCases.length > 0) {
      lines.push('**边界情况**:', '');
      for (const ec of feat.edgeCases) lines.push(`- ${ec}`);
      lines.push('');
    }
  }

  // 非功能需求
  if (spec.nonFunctional && spec.nonFunctional.length > 0) {
    lines.push('## 非功能需求', '');
    for (const nf of spec.nonFunctional) lines.push(`- ${nf}`);
    lines.push('');
  }

  // 技术方案
  if (spec.technicalApproach) {
    lines.push('## 技术方案', '');
    lines.push(renderStructuredText(spec.technicalApproach), '');
  }

  // 文件结构
  if (spec.fileStructure && spec.fileStructure.length > 0) {
    lines.push('## 文件结构', '');
    lines.push('预计创建/修改的文件:', '');
    for (const f of spec.fileStructure) lines.push(`- \`${f}\``);
    lines.push('');
  }

  // 验收标准
  lines.push('## 验收标准', '');
  for (let i = 0; i < spec.acceptance.length; i++) {
    lines.push(`${i + 1}. ${spec.acceptance[i]}`);
  }
  lines.push('');

  // 开放问题
  if (spec.openQuestions && spec.openQuestions.length > 0) {
    lines.push('## 开放问题', '');
    for (const q of spec.openQuestions) lines.push(`- ${q}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Plan 渲染 ─────────────────────────────────────────────────────────────

function renderPlan(plan) {
  const lines = [];

  lines.push('# 执行计划', '');
  lines.push('> 本文档由 plan.json 渲染生成，请勿手动修改。修改请编辑 plan.json 后重新渲染。', '');
  lines.push('---', '');

  // 概述
  if (plan.summary) {
    lines.push('## 概述', '');
    lines.push(renderStructuredText(plan.summary), '');
  }

  // 步骤总表
  lines.push('## 步骤总表', '');
  lines.push('| # | 步骤名称 | 涉及文件数 | 依赖 | 风险 |');
  lines.push('|---|---------|-----------|------|------|');
  for (const step of plan.steps) {
    const deps = step.dependencies && step.dependencies.length > 0 ? step.dependencies.join(', ') : '-';
    const risk = step.risk === 'guarded' ? '🔒 guarded' : 'normal';
    lines.push(`| ${step.id} | ${step.name} | ${step.files.length} | ${deps} | ${risk} |`);
  }
  lines.push('');

  // 步骤详情
  lines.push('## 步骤详情', '');
  for (const step of plan.steps) {
    lines.push(`### Step ${step.id}: ${step.name}`, '');

    if (step.risk === 'guarded') {
      lines.push('> ⚠️ **受保护步骤**: 本步骤涉及敏感文件，执行前需人工确认。', '');
    }

    lines.push('**目标**:', '');
    lines.push(renderStructuredText(step.goal), '');

    if (step.dependencies && step.dependencies.length > 0) {
      lines.push(`**依赖**: Step ${step.dependencies.join(', Step ')}`, '');
    }

    lines.push('**涉及文件**:', '');
    for (const f of step.files) lines.push(`- \`${f}\``);
    lines.push('');

    if (step.verification && step.verification.length > 0) {
      lines.push('**验收标准**:', '');
      for (const v of step.verification) lines.push(`- ${v}`);
      lines.push('');
    }

    lines.push('---', '');
  }

  return lines.join('\n');
}

function renderBrief(brief) {
  const lines = [];

  lines.push(`# ${brief.title}`, '');
  lines.push('> Generated from brief.json for fast mode. Edit brief.json and render again.', '');
  lines.push('---', '');

  lines.push('## Intent', '');
  lines.push(brief.intent, '');

  lines.push('## Scope', '');
  lines.push('### In Scope', '');
  for (const item of brief.scope.inScope) lines.push(`- ${item}`);
  lines.push('');
  if (brief.scope.outOfScope && brief.scope.outOfScope.length > 0) {
    lines.push('### Out Of Scope', '');
    for (const item of brief.scope.outOfScope) lines.push(`- ${item}`);
    lines.push('');
  }

  lines.push('## Implementation', '');
  lines.push('### Files', '');
  for (const file of brief.implementation.files) lines.push(`- \`${file}\``);
  lines.push('');
  lines.push('### Steps', '');
  brief.implementation.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push('');

  lines.push('## Verification', '');
  brief.verification.forEach((check, index) => {
    lines.push(`${index + 1}. ${check}`);
  });
  lines.push('');

  if (brief.risks && brief.risks.length > 0) {
    lines.push('## Risks', '');
    for (const risk of brief.risks) lines.push(`- ${risk}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── 入口 ──────────────────────────────────────────────────────────────────

async function main() {
  const [type, jsonPath, outputPath] = process.argv.slice(2);

  if (!type || !jsonPath || !outputPath) {
    process.stderr.write('用法: render.mjs <spec|plan> <jsonPath> <outputPath>\n');
    process.exit(1);
  }

  const data = await readJson(jsonPath);

  let markdown;
  switch (type) {
    case 'spec':
      markdown = renderSpec(data);
      break;
    case 'plan':
      markdown = renderPlan(data);
      break;
    case 'brief':
      markdown = renderBrief(data);
      break;
    default:
      process.stderr.write(`未知类型: ${type}（支持: spec, plan, brief）\n`);
      process.exit(1);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  process.stdout.write(JSON.stringify({
    ok: true,
    type,
    jsonPath,
    outputPath,
    size: markdown.length,
  }, null, 2) + '\n');
}

main();
