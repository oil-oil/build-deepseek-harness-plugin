#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ownRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let root = ownRoot;
let harness;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--harness") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      console.error("错误：--harness 需要一个 checkout 路径。");
      process.exit(2);
    }
    harness = resolve(value);
    index += 1;
  } else if (arg.startsWith("--")) {
    console.error(`错误：未知参数 ${arg}`);
    process.exit(2);
  } else if (!arg.startsWith("--")) {
    root = resolve(arg);
  }
}

const errors = [];
const warnings = [];
let checkedLinks = 0;
let checkedOfficial = 0;

function collectMarkdown(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    if ([".git", "node_modules"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collectMarkdown(path, output);
    else if (entry.endsWith(".md")) output.push(path);
  }
  return output;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function anchorsOf(text) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const base = slugify(heading[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function splitTarget(value) {
  const hash = value.indexOf("#");
  if (hash === -1) return { path: value, anchor: "" };
  return { path: value.slice(0, hash), anchor: decodeURIComponent(value.slice(hash + 1)) };
}

function checkLocalTarget(source, target) {
  const parts = splitTarget(target);
  const path = parts.path === "" ? source : resolve(dirname(source), decodeURIComponent(parts.path));
  if (!existsSync(path)) {
    errors.push(`${relative(root, source)}：相对链接不存在：${target}`);
    return;
  }
  if (parts.anchor && path.endsWith(".md")) {
    const anchors = anchorsOf(readFileSync(path, "utf8"));
    if (!anchors.has(parts.anchor)) {
      errors.push(`${relative(root, source)}：锚点不存在：${target}`);
    }
  }
}

function checkOfficialTarget(source, target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return;
  }
  if (url.hostname !== "github.com") return;
  const prefix = "/deepseek-ai/deepseek-harness/blob/";
  if (!url.pathname.startsWith(prefix)) return;
  checkedOfficial += 1;
  const rest = url.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) {
    errors.push(`${relative(root, source)}：官方链接缺少仓库文件路径：${target}`);
    return;
  }
  const repoPath = decodeURIComponent(rest.slice(slash + 1));
  if (harness && !existsSync(join(harness, repoPath))) {
    errors.push(`${relative(root, source)}：官方仓库中不存在：${repoPath}`);
  }
}

const markdown = collectMarkdown(root).sort();
for (const file of markdown) {
  const text = readFileSync(file, "utf8");
  const lineCount = text.split(/\r?\n/).length;
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("references/") && lineCount > 100 && !/^## 目录$/m.test(text)) {
    warnings.push(`${relative(root, file)} 超过 100 行但没有“## 目录”。`);
  }
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    checkedLinks += 1;
    if (/^https?:\/\//.test(target)) checkOfficialTarget(file, target);
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) checkLocalTarget(file, target);
  }
}

const skillPath = join(root, "SKILL.md");
const referencesPath = join(root, "references");
if (!existsSync(skillPath)) {
  errors.push("缺少 SKILL.md。");
} else if (existsSync(referencesPath)) {
  const skill = readFileSync(skillPath, "utf8");
  for (const file of collectMarkdown(referencesPath)) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (!skill.includes(rel)) errors.push(`SKILL.md 没有直接链接 reference：${rel}`);
  }
}

if (harness && !existsSync(join(harness, ".git"))) {
  warnings.push(`--harness 不是可识别的 Git checkout：${harness}`);
}

console.log(`Skill 引用检查：${root}`);
console.log(`  Markdown：${markdown.length} 个`);
console.log(`  链接：${checkedLinks} 个`);
console.log(`  官方 Harness 文件链接：${checkedOfficial} 个${harness ? "（已映射本地 checkout）" : "（未映射本地 checkout）"}`);
for (const item of warnings) console.log(`  ! ${item}`);
for (const item of errors) console.log(`  ✗ ${item}`);
console.log(`\n结果：${errors.length} 个错误，${warnings.length} 个警告。`);

process.exit(errors.length === 0 ? 0 : 1);
