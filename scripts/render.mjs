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
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
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
  lines.push(spec.background, '');
  lines.push('### 目标', '');
  lines.push(spec.goal, '');

  // 功能规格
  lines.push('## 功能规格', '');
  for (const feat of spec.features) {
    lines.push(`### ${feat.name}`, '');
    lines.push(feat.description, '');
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
    lines.push(spec.technicalApproach, '');
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

  if (plan.summary) {
    lines.push('## 概述', '');
    lines.push(plan.summary, '');
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
    lines.push(step.goal, '');

    if (step.dependencies && step.dependencies.length > 0) {
      lines.push(`**依赖**: Step ${step.dependencies.join(', Step ')}`, '');
    }

    lines.push('**涉及文件**:', '');
    for (const f of step.files) lines.push(`- \`${f}\``);
    lines.push('');

    lines.push('**验收标准**:', '');
    for (const v of step.verification) lines.push(`- ${v}`);
    lines.push('');

    lines.push('---', '');
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
    default:
      process.stderr.write(`未知类型: ${type}（支持: spec, plan）\n`);
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
