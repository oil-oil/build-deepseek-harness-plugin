#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = join(dirname(fileURLToPath(import.meta.url)), "check_plugin.mjs");

function fixture({ loaderId = "@example/plugin", clientBody = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "dsh-plugin-check-"));
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "src", "client"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "@example/plugin",
    type: "module",
    main: "./lib/index.js",
    exports: {
      ".": { import: "./lib/index.js" },
      "./client": { default: "./dist/client.web.js" },
    },
    files: ["lib", "dist", "cordis.patch.yml"],
    dsh: {
      bundle: { patch: "./cordis.patch.yml" },
      client: {
        platform: "web",
        inject: ["@deepseek-ai/dsh-client-ui-slots"],
      },
    },
    peerDependencies: {
      "@deepseek-ai/dsh-client-ui-primitives": "0.1.0",
      react: "^18.0.0",
    },
    devDependencies: {
      "@deepseek-ai/dsh-client-ui-primitives": "0.1.0",
      react: "^18.0.0",
    },
  }, null, 2));
  writeFileSync(join(root, "lib", "index.js"), "export function apply() {}\n");
  writeFileSync(join(root, "cordis.patch.yml"), "- insert:\n    - id: example-plugin\n      name: \"@example/plugin\"\n");
  writeFileSync(
    join(root, "dist", "client.web.js"),
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(loaderId)}, factory: (require) => {\n` +
      `require("react");\n${clientBody}\nreturn {}; } });\n`,
  );
  writeFileSync(
    join(root, "src", "client", "index.tsx"),
    "ctx.settingsScope.bind<Config>({ namespace: 'example' });\n",
  );
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
}

function updatePackage(root, update) {
  const path = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  update(pkg);
  writeFileSync(path, JSON.stringify(pkg, null, 2));
}

test("解析对象形式的 client export，并识别泛型 settingsScope.bind", () => {
  const root = fixture();
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Client 产物存在：dist\/client\.web\.js/);
    assert.match(result.stdout, /ModuleLoader ID：@example\/plugin/);
    assert.match(result.stdout, /settingsScope\.bind（含泛型写法）/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝与包名不一致的 ModuleLoader ID", () => {
  const root = fixture({ loaderId: "wrong-plugin" });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /应与包名 @example\/plugin 精确一致/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝 Client bundle external Node 内置模块", () => {
  const root = fixture({ clientBody: "require(\"node:fs\");" });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Client bundle external 了 Node 内置模块：node:fs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝一个包同时声明 bundle 与 profile", () => {
  const root = fixture();
  try {
    updatePackage(root, (pkg) => {
      pkg.dsh.profile = { bundles: ["@deepseek-ai/dsh-base"] };
    });
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /不能同时声明 dsh\.bundle 与 dsh\.profile/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("提示 Config 类型缺少同名运行时 Schema", () => {
  const root = fixture();
  try {
    writeFileSync(
      join(root, "src", "index.ts"),
      "export interface Config { timeoutMs: number }\nexport function apply(_ctx: unknown, _config: Config) {}\n",
    );
    const result = run(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /没有导出同名 Config Standard Schema/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝声明 Client 却不导出 client bundle", () => {
  const root = fixture();
  try {
    updatePackage(root, (pkg) => {
      delete pkg.exports["./client"];
    });
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /exports\["\.\/client"\] 不存在/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝把 Cordis 服务名写进 dsh.client.inject", () => {
  const root = fixture();
  try {
    updatePackage(root, (pkg) => {
      pkg.dsh.client.inject = ["slots", "locale"];
    });
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /写入了 Cordis 服务名：slots, locale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝 Client bundle 留下相对 require", () => {
  const root = fixture({ clientBody: "require(\"./chunk.js\");" });
  try {
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /留下了相对或绝对 require：\.\/chunk\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝 Client 产物未被 files 覆盖", () => {
  const root = fixture();
  try {
    updatePackage(root, (pkg) => {
      pkg.files = ["lib", "cordis.patch.yml"];
    });
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Client 产物未被 package\.json files 覆盖/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
