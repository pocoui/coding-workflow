#!/usr/bin/env node

/**
 * ai-coding-workflow 结构校验器
 *
 * 零依赖的轻量级 JSON Schema (draft-07 子集) 校验器。
 * 支持校验 state.json / spec.json / plan.json 是否符合 schema 契约。
 *
 * 用法:
 *   node scripts/validate.mjs <schemaPath> <dataPath>
 *   node scripts/validate.mjs state <statePath>
 *   node scripts/validate.mjs spec <specPath>
 *   node scripts/validate.mjs plan <planPath>
 *   node scripts/validate.mjs brief <briefPath>
 *
 * 退出码: 0=校验通过, 1=校验失败
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, '..', 'assets', 'schema');

// ─── 内置 schema 别名 ──────────────────────────────────────────────────────

const SCHEMA_ALIASES = {
  state: join(SCHEMA_DIR, 'state.schema.json'),
  spec: join(SCHEMA_DIR, 'spec.schema.json'),
  plan: join(SCHEMA_DIR, 'plan.schema.json'),
  brief: join(SCHEMA_DIR, 'brief.schema.json'),
};

// ─── JSON 读取 ─────────────────────────────────────────────────────────────

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

// ─── 校验器核心 ────────────────────────────────────────────────────────────

/**
 * 校验数据是否符合 schema
 * @param {*} data - 待校验数据
 * @param {object} schema - JSON Schema
 * @param {object} root - schema 根（用于解析 $ref）
 * @param {string} path - 当前路径（用于错误定位）
 * @returns {string[]} 错误信息数组（空数组=通过）
 */
function validate(data, schema, root, path = '') {
  const errors = [];
  root = root || schema;

  // $ref 解析
  if (schema.$ref) {
    const refSchema = resolveRef(schema.$ref, root);
    return validate(data, refSchema, root, path);
  }

  // type 校验
  if (schema.type !== undefined) {
    const typeErrors = validateType(data, schema.type, path);
    if (typeErrors.length > 0) return typeErrors; // 类型不符则后续校验无意义
  }

  // const 校验
  if (schema.const !== undefined) {
    if (data !== schema.const) {
      errors.push(`${path || '(root)'}: 期望常量 ${JSON.stringify(schema.const)}, 实际 ${JSON.stringify(data)}`);
    }
  }

  // enum 校验
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(data)) {
      errors.push(`${path || '(root)'}: 期望枚举值 [${schema.enum.join(', ')}], 实际 ${JSON.stringify(data)}`);
    }
  }

  // object 校验
  if (schema.type === 'object' && data !== null && typeof data === 'object' && !Array.isArray(data)) {
    // required
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`${path || '(root)'}: 缺少必选字段 "${field}"`);
        }
      }
    }

    // properties
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const subPath = path ? `${path}.${key}` : key;
          errors.push(...validate(data[key], subSchema, root, subPath));
        }
      }
    }

    // additionalProperties
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
          errors.push(`${path || '(root)'}: 存在未定义的属性 "${key}"`);
        }
      }
    }
  }

  // array 校验
  if (schema.type === 'array' && Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${path || '(root)'}: 数组长度 ${data.length} 小于最小值 ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${path || '(root)'}: 数组长度 ${data.length} 超过最大值 ${schema.maxItems}`);
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const subPath = `${path || '(root)'}[${i}]`;
        errors.push(...validate(data[i], schema.items, root, subPath));
      }
    }
  }

  // string 校验
  if (schema.type === 'string' && typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path || '(root)'}: 字符串长度 ${data.length} 小于最小值 ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${path || '(root)'}: 字符串长度 ${data.length} 超过最大值 ${schema.maxLength}`);
    }
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(data)) {
        errors.push(`${path || '(root)'}: 字符串 "${data}" 不匹配模式 ${schema.pattern}`);
      }
    }
    if (schema.format === 'date-time') {
      if (isNaN(Date.parse(data))) {
        errors.push(`${path || '(root)'}: 不是合法的 ISO 日期时间: "${data}"`);
      }
    }
  }

  // number/integer 校验
  if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path || '(root)'}: 值 ${data} 小于最小值 ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${path || '(root)'}: 值 ${data} 超过最大值 ${schema.maximum}`);
    }
    if (schema.type === 'integer' && !Number.isInteger(data)) {
      errors.push(`${path || '(root)'}: 值 ${data} 不是整数`);
    }
  }

  return errors;
}

/**
 * 校验数据类型
 */
function validateType(data, expectedType, path) {
  const types = Array.isArray(expectedType) ? expectedType : [expectedType];

  for (const t of types) {
    if (checkType(data, t)) return []; // 匹配任一类型即通过
  }

  return [`${path || '(root)'}: 类型不匹配，期望 ${expectedType}, 实际 ${Array.isArray(data) ? 'array' : typeof data}`];
}

/**
 * 检查数据是否为指定类型
 */
function checkType(data, type) {
  switch (type) {
    case 'string': return typeof data === 'string';
    case 'integer': return typeof data === 'number' && Number.isInteger(data);
    case 'number': return typeof data === 'number';
    case 'boolean': return typeof data === 'boolean';
    case 'array': return Array.isArray(data);
    case 'object': return data !== null && typeof data === 'object' && !Array.isArray(data);
    case 'null': return data === null;
    default: return true; // 未知类型不校验
  }
}

/**
 * 解析 $ref（仅支持本地引用 #/$defs/...）
 */
function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) {
    throw new Error(`仅支持本地引用: ${ref}`);
  }
  const parts = ref.slice(2).split('/');
  let target = root;
  for (const part of parts) {
    target = target[part];
    if (target === undefined) {
      throw new Error(`无法解析引用: ${ref}`);
    }
  }
  return target;
}

// ─── 命令入口 ──────────────────────────────────────────────────────────────

async function main() {
  const [arg1, arg2] = process.argv.slice(2);

  if (!arg1) {
    process.stderr.write('用法: validate.mjs <schemaPath|alias> <dataPath>\n');
    process.stderr.write(`别名: ${Object.keys(SCHEMA_ALIASES).join(', ')}\n`);
    process.exit(1);
  }

  // 解析 schema 路径（支持别名）
  const schemaPath = SCHEMA_ALIASES[arg1] || arg1;
  const dataPath = arg2;

  if (!dataPath) {
    process.stderr.write('缺少数据文件路径\n');
    process.exit(1);
  }

  let schema, data;
  try {
    schema = await readJson(schemaPath);
  } catch (err) {
    process.stderr.write(`[validate] 无法读取 schema: ${schemaPath}\n${err.message}\n`);
    process.exit(1);
  }

  try {
    data = await readJson(dataPath);
  } catch (err) {
    process.stderr.write(`[validate] 无法读取数据: ${dataPath}\n${err.message}\n`);
    process.exit(1);
  }

  const errors = validate(data, schema, schema);

  if (errors.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, schema: arg1, dataPath }, null, 2) + '\n');
    process.exit(0);
  } else {
    process.stdout.write(JSON.stringify({ ok: false, schema: arg1, dataPath, errors }, null, 2) + '\n');
    process.exit(1);
  }
}

main();
