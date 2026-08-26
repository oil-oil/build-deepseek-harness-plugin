# 插件结构与构建

## 目录

- [推荐目录](#推荐目录)
- [package.json](#packagejson)
- [Config Schema](#config-schema)
- [五层依赖模型](#五层依赖模型)
- [Cordis patch](#cordis-patch)
- [bundle、profile 与配置层](#bundleprofile-与配置层)
- [Host 入口](#host-入口)
- [Client 入口](#client-入口)
- [双 bundle 构建](#双-bundle-构建)
- [CSS](#css)
- [构建产物检查](#构建产物检查)

官方依据：[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)、[插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)、[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)、[Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)、[Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.zh.md)。`master` 只用于导航；包字段、构建入口和 ModuleLoader 共享模块以目标 commit 与构建产物为准。

## 推荐目录

```text
example-plugin/
├── cordis.patch.yml
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── src/
│   ├── index.ts
│   └── client/
│       ├── index.tsx
│       └── styles.css
├── lib/
│   ├── index.js
│   └── client.js
└── tests/
```

`lib/` 是 TypeScript 包的发布产物。官方[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)的最小示例可以直接发布 `index.js`；Git 源码安装若还要构建，官方要求自包含 `prepare`。把 `lib/` 提交进仓库、让入口无需安装期构建，是本 Skill 验证过的项目约定，不是官方主路径。

本地迭代的插件必须先有 git 基线提交。没有提交就改 6K 行包，误改无法回退。`lib/` 可提交可不提交，但源码、patch、测试和构建配置必须能回到一个已知状态。

profile 用 `file:` / 硬链接装本地包时，不要用 `cp` 覆盖 `lib/` 里已存在的文件：`cp` 会先 unlink 再创建，profile 里那份就变成孤儿旧产物。应原地覆写（`writeFile` / `cat src > dest`）。tsdown 原地写 JS 通常仍保持硬链接；额外 `cp` 附属脚本最容易踩坑。改过构建复制策略后，检查 `~/.dsh/profiles/<name>/node_modules/<pkg>/lib/` 是否仍与源码 inode 相同。

## package.json

下面是 Client-only 插件的最小结构。版本号必须按目标 Harness 实际版本调整。

```json
{
  "name": "example-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/client.js",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-slots"
      ]
    }
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-client-locale": "<目标版本>",
    "@deepseek-ai/dsh-client-runtime": "<目标版本>",
    "@deepseek-ai/dsh-client-ui-slots": "<目标版本>",
    "@types/react": "^18.3.0",
    "react": "^18.3.0",
    "tsdown": "^0.22.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

`exports["./client"]` 可以是字符串，也可以是带 `default`、`import` 或 `browser` 的条件对象；构建和检查工具必须解析实际目标，不能默认它一定是 `./lib/client.js`。

## Config Schema

插件接受 Cordis 行配置时，同时导出类型和同名 Standard Schema：

```ts
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";

export interface Config {
  timeoutMs: number;
  mode: "fast" | "accurate";
}

export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().default(30_000),
  mode: Schema.union(["fast", "accurate"]).default("fast"),
});

export function apply(ctx: Context, config: Config): void {
  // config 已校验并补齐默认值。
}
```

规则：

- `interface Config` 只提供编译时类型，不等于运行时 Schema。
- `export const Config` 必须满足 Standard Schema，不能导出普通配置对象。
- 默认值与单字段约束写入 Schema；无效配置应在插件加载时明确失败。
- 不同部署可能变化的端口、超时、路径、模式和开关都应配置化。

## 五层依赖模型

### 1. Client Cordis 服务

Client 源码中的：

```ts
export const inject = ["slots", "locale", "connection"];
```

表示组件运行时要从 Cordis Context 取得哪些服务。这里写服务名，不写 npm 包名。

### 2. Client 包级信息边

`package.json` 的 `dsh.client.inject` 写 Client 模块包名，但只作为 preflight display 和 HMR diff 使用的信息图。它不启用 Loader 行、不约束 Client apply 顺序，也不是源码 import 清单。

### 3. ModuleLoader 模块请求图

从 `0.1.0-rc.8` 起，`dsh.client.external` 声明非 baseline 值导入的精确模块 specifier。同步 `require` 不能等待，因此该图决定动态供应包的工厂先于消费者到达，并拒绝环。

默认 baseline 对每个动态 Client bundle 隐式可用：

```text
react
react/jsx-runtime
react-dom
react-dom/client
@deepseek-ai/cordis
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
@deepseek-ai/dsh-client-runtime/client
```

不要把 baseline 重复写进 `dsh.client.external`。若值导入 `@owner/shared-client/client`，则在 rc.8+ 的 manifest 中声明：

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "external": ["@owner/shared-client/client"]
    }
  }
}
```

支持 rc.5/rc.7 时不能假设 `external` 协议存在，必须按目标版本的固定共享表和实际加载器行为构建另一条兼容路径。

### 4. 构建产物的真实值请求

Client bundle 中被 externalize 的值导入会留下 `require("...")`：

```bash
rg -o 'require\("[^"]+"\)' lib/client.js | sort -u
```

必须检查构建后的真实集合，不只检查 bundler 配置。每一项都必须属于 baseline 或显式 `dsh.client.external`；其他模块应被打进插件 bundle。`import type` 会被擦除，不形成 `require(...)`，也不增加模块图边。

### 5. npm 依赖字段

| 依赖 | 推荐位置 | 原因 |
| --- | --- | --- |
| Client 编译使用的 React、Harness Client 包 | `devDependencies`；若目标官方包用 peer 表达兼容范围，可同时声明 peer | 本地类型检查和构建需要 |
| Client baseline 值模块 | bundler external；不要重复写进 `dsh.client.external` | 运行时由 Web ModuleLoader 平台表提供 |
| rc.8+ 非 baseline 值模块 | bundler external + 精确 `dsh.client.external`；动态 DSH 包通常同时为 peer + dev | 运行时由模块请求图提供并排序 |
| 打进 Client bundle 的小型纯 JS 库 | `dependencies`，并由 bundler 打包 | 插件自行携带 |
| Host 在 Node 运行时直接 `import` 的包 | `dependencies` 或确实由宿主提供时用 `peerDependencies` | Node 入口需要正常解析 |
| 仅类型包、测试工具、构建工具 | `devDependencies` | 不参与运行 |

GitHub profile 的组合根包可能没有直接声明插件 peer，因此 pnpm 会输出 `missing peer`。这不等于加载失败，也不能据此把所有 peer 机械移动到 `devDependencies`。先区分 Host 值导入、Client baseline、显式 `external` 和纯类型依赖，再以目标版本官方包的声明方式、Host 启动结果和 Client load report 判断。

## Cordis patch

```yaml
- insert:
    - id: example-plugin
      name: example-plugin
```

替换官方插件时，显式禁用旧 ID，再插入自己的唯一 ID：

```yaml
- id: official-plugin
  disabled: true
- insert:
    - id: example-plugin
      name: "@owner/example-plugin"
```

- `id` 在组合树中唯一。
- `name` 对应被安装的包名。
- 不要借用官方插件 ID。
- 替换插件保留必要的 provider、Settings schema 和能力契约，而不是保留官方内部 ID。
- 需要定位插入位置时，先检查当前版本已有 patch 结构，不要盲猜。

本地源码开发使用官方[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)的 `--patch` overlay。patch 不会改变模块解析基准，因此引用 checkout 内源码时使用绝对路径：

```yaml
- insert:
    - id: example-plugin
      name: /absolute/path/to/example-plugin/src/index.ts
```

```bash
pnpm dsh web --patch /absolute/path/to/example-plugin/cordis.dev.patch.yml
```

## bundle、profile 与配置层

`package.json` 中两种 manifest 不能混用：

- `dsh.bundle.patch`：组合包贡献的一层配置。
- `dsh.profile.bundles`：用户 profile 按顺序启用的组合包列表。

生效顺序：

```text
bundle patches（按列表顺序）
  → profile/cordis.patch.yml
  → $DSH_HOME/cordis.patch.yml
  → argv --patch（按参数顺序）
```

后层胜出。patch 命中已有行时会替换该行完整的 `config`，不会深合并键。例如只想覆盖 `port`，仍需重述该行要求的其他配置。组合包应提供合理默认值，同时保留用户 profile patch 的覆盖权。若由 Desktop 等产品启动器启动，还要检查它是否在官方四层之后追加产品层；这类后置层可以再次覆盖用户配置。

安装或修改层后先检查：

```bash
dsh --profile demo --dump-config
```

确认输出包含组合包层、目标行 ID 和完整配置，再启动 Harness。

## Host 入口

Client-only 插件：

```ts
export const name = "example-plugin";

export function apply(): void {
  // Client-only：保留入口供 Cordis 发现。
}
```

Mixed 插件在这里注册自己的 Host 服务、Settings 或 Remote。所有监听器、定时器和覆盖都应通过 Cordis effect 或显式 disposer 清理。

## Client 入口

```ts
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";

export const inject = ["slots", "locale"];

export function apply(ctx: ClientContext): void {
  // 注册 locale、store、effect 和 slot。
}
```

只声明真正使用的服务。这里的 `inject` 是 Cordis 服务依赖，不是 npm 依赖、Client 模块包名或“可能会用到”的能力列表。

## 双 bundle 构建

Host 输出 Node ESM；Client 输出浏览器 CJS，并包裹为 ModuleLoader 模块。下面是 `0.1.1-rc.2` baseline 上验证过的独立仓库模板，不是永久 bundler API：

```ts
import { defineConfig } from "tsdown";

const id = "example-plugin";
const externals = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
];

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    clean: false,
  },
  {
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    clean: false,
    deps: {
      neverBundle: externals,
      alwaysBundle: (name) => externals.includes(name) ? undefined : true,
      onlyBundle: false
    },
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });"
    }
  }
]);
```

具体 bundler API 可能随版本变化。保留四个不变量：

1. Client 产物调用 `window.__ModuleLoader__.load`。
2. ModuleLoader ID 与包名精确一致；不要只检查 bundle 中是否碰巧出现了包名字符串。
3. baseline 与 manifest 显式请求的模块 externalize，插件私有模块 bundle。
4. 构建后的真实 `require(...)` 集合都能归类为 baseline 或 `dsh.client.external`，模块图无环。

## CSS

Client bundle 不应依赖安装目录中的相对 CSS 文件被 Web 服务器自动发现。可在构建时将 CSS 转成模块，在插件加载时插入带唯一 `data-plugin-css` 的 `<style>`，并避免重复插入。通过 `ctx.effect()` 管理时始终返回 disposer；若 style 已存在，也返回空 disposer，而不是 `undefined`。

CSS 规则：

- 组件样式必须带插件根类名，例如 `.examplePlugin`。
- 优先使用 Harness 的 `--dsw-alias-*` 语义变量，不复制静态色值。
- 字号与行高成对设置；保留键盘焦点可见性和 reduced-motion 行为。
- Feature CSS 不写 light/dark 分支，共享主题分支归 Theme 服务和主题包管理。
- 不覆盖 `button`、`input`、`[role=tab]` 等全局选择器。
- 运行时插入的 `<style data-plugin>` 必须可更新、可释放：已存在则改 `textContent`，不要再插一份旧样式压住新样式；`apply()` 的 disposer 删掉这些标签，并在重新挂载时按登记表写回。
- 写到 `documentElement` 的自定义 CSS 变量（例如侧栏宽度）也必须在 disposer 里 `removeProperty`。

## 构建产物检查

```bash
test -f lib/index.js
test -f lib/client.js
grep -F "window.__ModuleLoader__.load" lib/client.js
rg -o 'require\("[^"]+"\)' lib/client.js | sort -u
node /path/to/build-deepseek-harness-plugin/scripts/check_plugin.mjs .
npm pack --dry-run
```

修改本 Skill 的检查器后，额外执行：

```bash
node --test "$SKILL_DIR/scripts/check_plugin.test.mjs"
```
