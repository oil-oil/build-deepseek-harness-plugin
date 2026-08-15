#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve, relative, extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.argv[2] ?? process.cwd());
const errors = [];
const warnings = [];
const notes = [];
const passed = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function addNote(message) {
  notes.push(message);
}

function addPassed(message) {
  passed.push(message);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function resolvePackagePath(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return resolve(root, value.replace(/^\.\//, ""));
}

function resolveExportTarget(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = resolveExportTarget(item);
      if (target) return target;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const key of ["browser", "default", "import", "require"]) {
      const target = resolveExportTarget(value[key]);
      if (target) return target;
    }
  }
  return undefined;
}

function packageNameOf(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function isNodeBuiltin(specifier) {
  const bare = specifier.replace(/^node:/, "").split("/")[0];
  return builtinModules.includes(specifier) || builtinModules.includes(bare);
}

function isCoveredByFiles(path) {
  if (!Array.isArray(pkg.files)) return false;
  const rel = relative(root, path).replaceAll("\\", "/");
  return pkg.files.some((entry) => {
    if (typeof entry !== "string") return false;
    const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "");
    const wildcard = normalized.search(/[*!?[]/);
    const prefix = (wildcard === -1 ? normalized : normalized.slice(0, wildcard))
      .replace(/\/$/, "");
    return rel === normalized || (prefix !== "" && (rel === prefix || rel.startsWith(`${prefix}/`)));
  });
}

function checkPackaged(path, label) {
  if (!Array.isArray(pkg.files)) {
    addWarning(`package.json 缺少 files；无法确认 ${label} 会进入 GitHub/npm 安装包。`);
  } else if (!isCoveredByFiles(path)) {
    addError(`${label}未被 package.json files 覆盖：${relative(root, path)}`);
  }
}

function collectSources(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "lib", "dist", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collectSources(path, output);
    else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) output.push(path);
  }
  return output;
}

function checkTracked(path, label) {
  const repo = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });
  if (repo.status !== 0 || repo.stdout.trim() !== "true") return;

  const rel = relative(root, path);
  const tracked = spawnSync("git", ["-C", root, "ls-files", "--error-unmatch", rel], {
    encoding: "utf8",
  });
  if (tracked.status !== 0) {
    addWarning(`${label} 存在但未被 Git 跟踪；github: 安装时可能缺失。`);
  }
}

const packagePath = join(root, "package.json");
if (!existsSync(packagePath)) {
  console.error(`错误：${root} 下不存在 package.json`);
  process.exit(2);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  addPassed("package.json 可以解析");
} catch (error) {
  console.error(`错误：package.json 无法解析：${error.message}`);
  process.exit(2);
}

if (typeof pkg.name !== "string" || pkg.name.length === 0) {
  addError("package.json 缺少 name。");
} else {
  addPassed(`插件包名：${pkg.name}`);
}

if (pkg.dsh?.bundle && pkg.dsh?.profile) {
  addError("同一个 package.json 不能同时声明 dsh.bundle 与 dsh.profile。");
} else if (pkg.dsh?.bundle) {
  addPassed("package.json 声明为 dsh bundle");
}

const mainTarget = typeof pkg.main === "string"
  ? pkg.main
  : resolveExportTarget(pkg.exports?.["."]);
const mainPath = resolvePackagePath(mainTarget);
if (!mainPath) {
  addError("package.json 缺少可解析的 main 或 exports[\".\"]。");
} else if (!existsSync(mainPath)) {
  addError(`Host 产物不存在：${relative(root, mainPath)}`);
} else {
  addPassed(`Host 产物存在：${relative(root, mainPath)}`);
  checkTracked(mainPath, "Host 产物");
  checkPackaged(mainPath, "Host 产物");
}

const patchPath = resolvePackagePath(pkg.dsh?.bundle?.patch);
if (!patchPath) {
  addError("缺少 dsh.bundle.patch。");
} else if (!existsSync(patchPath)) {
  addError(`Cordis patch 不存在：${relative(root, patchPath)}`);
} else {
  const patch = readText(patchPath) ?? "";
  addPassed(`Cordis patch 存在：${relative(root, patchPath)}`);
  if (!/^\s*-\s+insert\s*:/m.test(patch)) {
    addWarning("Cordis patch 中没有找到顶层 insert，请确认装配结构符合目标版本。");
  }
  if (pkg.name && !new RegExp(`\\bname\\s*:\\s*["']?${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*$`, "m").test(patch)) {
    addWarning(`Cordis patch 中未找到与包名一致的 name: ${pkg.name}。`);
  }
  checkTracked(patchPath, "Cordis patch");
  checkPackaged(patchPath, "Cordis patch");
}

const client = pkg.dsh?.client;
if (client) {
  if (client.platform !== "web") {
    addWarning(`dsh.client.platform 当前为 ${JSON.stringify(client.platform)}，Web 插件通常应为 "web"。`);
  } else {
    addPassed("Client platform 为 web");
  }

  if (!Array.isArray(client.inject) || client.inject.length === 0) {
    addWarning("dsh.client.inject 为空；请确认 Client 不依赖任何 Harness 浏览器服务。");
  } else {
    const invalidInject = client.inject.filter((item) => typeof item !== "string" || item.length === 0);
    const duplicateInject = client.inject.filter((item, index) => client.inject.indexOf(item) !== index);
    const serviceNames = new Set(["slots", "locale", "connection", "remote", "theme", "settingsScope", "modules", "loader"]);
    const mistakenServices = client.inject.filter((item) => serviceNames.has(item));
    if (invalidInject.length > 0) {
      addError("dsh.client.inject 只能包含非空 Client 模块包名。");
    }
    if (duplicateInject.length > 0) {
      addWarning(`dsh.client.inject 含重复项：${[...new Set(duplicateInject)].join(", ")}`);
    }
    if (mistakenServices.length > 0) {
      addError(
        `dsh.client.inject 写入了 Cordis 服务名：${[...new Set(mistakenServices)].join(", ")}；这里应填写提供服务的 Client 模块包名。`,
      );
    }
    if (invalidInject.length === 0 && mistakenServices.length === 0) {
      addPassed(`声明了 ${client.inject.length} 个 Client 模块注入`);
    }
  }

  const rawClientExport = pkg.exports?.["./client"];
  if (rawClientExport === undefined) {
    addError('声明了 dsh.client，但 exports["./client"] 不存在。');
  }
  const clientExport = resolveExportTarget(rawClientExport);
  if (rawClientExport !== undefined && !clientExport) {
    addError('exports["./client"] 无法解析到字符串产物路径。');
  }
  const clientPath = resolvePackagePath(clientExport);
  if (clientExport && (!clientPath || !existsSync(clientPath))) {
    addError(`Client 产物不存在：${clientExport}`);
  } else if (clientPath) {
    const output = readText(clientPath) ?? "";
    addPassed(`Client 产物存在：${relative(root, clientPath)}`);
    const loader = output.match(
      /window\s*\.\s*__ModuleLoader__\s*\.\s*load\s*\(\s*\{[\s\S]{0,500}?\bid\s*:\s*["']([^"']+)["']/,
    );
    if (!loader) {
      addError("Client 产物没有调用 window.__ModuleLoader__.load。");
    } else {
      addPassed("Client 产物包含 Harness ModuleLoader 包装");
      if (pkg.name && loader[1] !== pkg.name) {
        addError(`ModuleLoader ID 为 ${loader[1]}，应与包名 ${pkg.name} 精确一致。`);
      } else {
        addPassed(`ModuleLoader ID：${loader[1]}`);
      }
    }

    const requires = [...output.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)]
      .map((match) => match[1]);
    const uniqueRequires = [...new Set(requires)].sort();
    if (uniqueRequires.length === 0) {
      addNote("Client bundle 没有 external require；确认 React/Harness 包没有被错误打进 bundle。");
    } else {
      addNote(`Client bundle external require：${uniqueRequires.join(", ")}。请与目标 Web 共享模块表核对。`);
    }

    const dependencyNames = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    for (const specifier of uniqueRequires) {
      if (isNodeBuiltin(specifier)) {
        addError(`Client bundle external 了 Node 内置模块：${specifier}`);
      } else if (specifier.startsWith(".") || specifier.startsWith("/")) {
        addError(`Client bundle 留下了相对或绝对 require：${specifier}；插件自有模块应打进 bundle。`);
      } else if (!dependencyNames.has(packageNameOf(specifier))) {
        addWarning(`Client external 模块未出现在任何依赖字段：${specifier}`);
      }
    }
    checkTracked(clientPath, "Client 产物");
    checkPackaged(clientPath, "Client 产物");
  }

  const browserPeerNames = Object.keys(pkg.peerDependencies ?? {}).filter(
    (name) => name === "react" || name === "react-dom" || name.startsWith("@deepseek-ai/dsh-client-"),
  );
  if (browserPeerNames.length > 0) {
    addNote(
      `浏览器宿主模块声明为 peer：${browserPeerNames.join(", ")}。` +
      " GitHub profile 可能显示 missing peer；这不是加载失败，需继续检查 boot manifest 和 Client load report。",
    );
  }
} else if (pkg.exports?.["./client"] !== undefined) {
  addWarning('package.json 导出了 exports["./client"]，但没有声明 dsh.client；该 bundle 不会进入 Web boot graph。');
}

const sources = collectSources(join(root, "src"));
const combinedSource = sources
  .map((path) => `\n// ${relative(root, path)}\n${readText(path) ?? ""}`)
  .join("\n");

const hasConfigType = /export\s+(?:interface|type)\s+Config\b/.test(combinedSource);
const hasConfigSchema = /export\s+const\s+Config\b/.test(combinedSource);
if (hasConfigType && !hasConfigSchema) {
  addWarning("源码导出了 Config 类型，但没有导出同名 Config Standard Schema；Cordis 无法在加载时校验并补齐默认值。");
} else if (hasConfigSchema && !hasConfigType) {
  addWarning("源码导出了 Config Schema，但没有导出同名 Config 类型；请确认插件配置保持类型安全。");
} else if (hasConfigType && hasConfigSchema) {
  addPassed("源码同时导出 Config 类型与同名 Schema");
}

if (/settingsScope\s*\.\s*bind\b/.test(combinedSource)) {
  addNote(
    "源码使用 settingsScope.bind（含泛型写法）。必须通过目标运行时 settings.describe 验证 namespace 已向 Web 暴露。",
  );
}

if (/credentials\s*\.\s*set\s*\(/.test(combinedSource) && /settings\s*\.\s*mutate\s*\(/.test(combinedSource)) {
  addNote("源码同时写入 Credentials 与 Settings；请按依赖关系固定顺序，并在部分失败后只重试未提交步骤。");
}

if (/MutationObserver\s*\(/.test(combinedSource)) {
  addWarning("源码使用 MutationObserver。若它用于追踪 Harness 内部 DOM，请改用公开 Slot 或服务 API。");
}

const readme = readText(join(root, "README.md"));
if (readme && pkg.repository && !readme.includes("@deepseek-ai/dsh plugin")) {
  addWarning("README.md 未找到官方 dsh plugin 安装命令。");
}

if (typeof pkg.scripts?.prepare === "string") {
  addNote(
    "package.json 定义了 prepare。Git 安装会执行安装期代码；请确认构建自包含，并在文档中说明 pnpm allowBuilds 与锁定 commit。",
  );
}

if (readme && /github:[^\s`)]+/.test(readme) && !/github:[^\s`)]+#[0-9a-f]{7,40}\b/i.test(readme)) {
  addNote("README 使用未锁定提交的 GitHub 安装示例；可保留普通命令，但应补充 github:owner/repo#<sha> 的可复现安装方式。");
}

console.log(`DeepSeek Harness 插件检查：${root}`);
for (const item of passed) console.log(`  ✓ ${item}`);
for (const item of notes) console.log(`  i ${item}`);
for (const item of warnings) console.log(`  ! ${item}`);
for (const item of errors) console.log(`  ✗ ${item}`);
console.log(`\n结果：${errors.length} 个错误，${warnings.length} 个警告，${notes.length} 条提示，${passed.length} 项通过。`);

process.exit(errors.length === 0 ? 0 : 1);
