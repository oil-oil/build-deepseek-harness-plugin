#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = join(dirname(fileURLToPath(import.meta.url)), "check_references.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dsh-skill-refs-"));
  const harness = mkdtempSync(join(tmpdir(), "dsh-harness-"));
  mkdirSync(join(root, "references"), { recursive: true });
  mkdirSync(join(harness, ".git"), { recursive: true });
  mkdirSync(join(harness, "docs"), { recursive: true });
  writeFileSync(join(harness, "docs", "guide.zh.md"), "# Guide\n");
  writeFileSync(
    join(root, "SKILL.md"),
    "# Skill\n\n读 [reference](references/guide.md)。\n",
  );
  writeFileSync(
    join(root, "references", "guide.md"),
    "# Guide\n\n- [本页](#细节)\n- [官方](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/guide.zh.md)\n\n## 细节\n",
  );
  return { root, harness };
}

function run(root, harness) {
  return spawnSync(process.execPath, [checker, root, "--harness", harness], { encoding: "utf8" });
}

test("接受有效的相对链接、锚点和官方仓库文件", () => {
  const { root, harness } = fixture();
  try {
    const result = run(root, harness);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /结果：0 个错误/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(harness, { recursive: true, force: true });
  }
});

test("拒绝不存在的相对文件和锚点", () => {
  const { root, harness } = fixture();
  try {
    writeFileSync(
      join(root, "references", "guide.md"),
      "# Guide\n\n[坏文件](missing.md) [坏锚点](#missing)\n",
    );
    const result = run(root, harness);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /相对链接不存在：missing\.md/);
    assert.match(result.stdout, /锚点不存在：#missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(harness, { recursive: true, force: true });
  }
});

test("拒绝官方仓库中不存在的目标和未被主文件链接的 reference", () => {
  const { root, harness } = fixture();
  try {
    writeFileSync(
      join(root, "references", "guide.md"),
      "# Guide\n\n[官方](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/missing.zh.md)\n",
    );
    writeFileSync(join(root, "references", "orphan.md"), "# Orphan\n");
    const result = run(root, harness);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /官方仓库中不存在：docs\/missing\.zh\.md/);
    assert.match(result.stdout, /没有直接链接 reference：references\/orphan\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(harness, { recursive: true, force: true });
  }
});

test("拒绝缺少路径的 --harness 参数", () => {
  const { root, harness } = fixture();
  try {
    const result = spawnSync(process.execPath, [checker, root, "--harness"], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /--harness 需要一个 checkout 路径/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(harness, { recursive: true, force: true });
  }
});
