---
name: build-deepseek-harness-plugin
description: 创建、改造、迁移、评审、调试和发布 DeepSeek Harness 可安装组合包。涉及 Cordis 装配、官方插件替换、Web Client bundle、Slot（含 sidebar / shell.overlay / settings.plugin.item）、Theme Token、本地化、Settings、Credentials、Typert Remote、改 schema 后界面不更新、GitHub 安装、依赖告警或加载失败时使用。不适用于普通网页脚本、浏览器扩展，也不适用于会话内 cordis_define 动态包。
---

# 构建 DeepSeek Harness 插件

## 目标

用 Harness 官方的插件装配、Client Slot 和服务 API 实现独立插件。优先扩展公开接口，不修改 Harness 核心、不依赖 DOM 结构、不用全局 CSS 强行覆盖产品界面。

## 官方入口与证据顺序

先读 [official-practices.md](references/official-practices.md)。其中区分官方契约、目标版本源码事实和本 Skill 的项目约定。常用官方入口：

- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)
- [插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)
- [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)
- [插件与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md)
- [Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.zh.md)
- [能力的三种角色设计](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/index.zh.md)
- [扩展插件形态实操手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.zh.md)
- [Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)
- [Web UI 样式规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)
- [Settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.zh.md)
- [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.zh.md)
- [API Gateway 与 Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md)
- 会话内动态包走官方 [`cordis-plugin-development`](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md)

`master` 链接只用于导航。目标版本源码、公开类型和生成的 Catalog 优先于在线文档；版本观察必须记录 commit，不能写成永久 API。

## Reference 路由

- 每次任务先读 [official-practices.md](references/official-practices.md)，记录证据基线。
- 搭包、配置、构建或检查产物时读 [package-and-build.md](references/package-and-build.md)。
- 做 Client Slot、主题、本地化或界面时读 [client-slots-and-theme.md](references/client-slots-and-theme.md)。
- 做持久化、Remote、Settings、Credentials、安装或发布时读 [persistence-and-release.md](references/persistence-and-release.md)。

只读与当前任务有关的 reference；不要为了“保险”一次加载全部细节。

## 开始前

1. 确认目标确实是 **DeepSeek Harness**，记录源码 commit、CLI/包版本、profile 和交付方式；版本与 commit 冲突时以 commit 为主锚点并保留两者。
2. 判断任务属于动态 Cordis Plugin，还是可安装的组合包；本 Skill 默认处理后者。
3. 优先读取用户本地 Harness 源码和已安装包；本地不存在时再查官方仓库。
4. 若已有相近的官方插件，比较其 `package.json`、`cordis.patch.yml`、Config、Host/Client 入口和构建配置。
5. 不要凭记忆假设 Slot、注入服务、Theme Token 或 Settings 命名空间在当前版本可用。

重点核对：

- 当前提交的 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
- 目标服务对应的 `src/client/index.ts` 和类型声明
- `packages/host/apiproxy` 的 Web Settings namespace 暴露逻辑
- 当前 profile 使用的 DeepSeek Harness 版本
- 当前 Web 平台实际注册到 ModuleLoader 的共享模块表

动态插件通过 `cordis_define` / `cordis_run` 交付纯 JavaScript Package，不能使用 import、JSX 或 TypeScript；可分发插件通过 `dsh.bundle` 安装到 profile。不要混用两套产物格式。会话内动态包改走官方 [`cordis-plugin-development`](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md)。

## 先判断插件类型

| 类型 | 适用场景 | 产物 |
| --- | --- | --- |
| Host-only | Node 服务、命令、远程接口、后端状态 | `lib/index.js` |
| Client-only | 设置页、主题、对话区 UI、纯浏览器状态 | Host 占位入口 + `lib/client.js` |
| Mixed | UI 需要调用插件自己的 Host 能力 | Host 服务 + Client bundle |

Client-only 插件仍保留一个最小 Host 入口，供 Cordis 发现和装配。
Mixed 只是代码形态，不代表 Host→Client 通路自动存在；先通过目标 commit 的 Settings 暴露逻辑或 Remote contribution 机制证明独立安装包能完成桥接。

再判断是新增还是替换：

- **新增插件**：使用自己的 Cordis ID、服务名和 Settings namespace。
- **替换官方插件**：先读取被替换插件的 patch、provider、Settings schema、Credentials 和能力契约；在 patch 中禁用原插件并插入自己的唯一 ID。保留必要的外部契约，但不要复用官方 Cordis ID。

替换插件必须证明原能力没有倒退。例如底层模型已原生支持某项能力时直接透传，只对缺失能力做桥接。扩展官方 Settings schema 时保留全部官方字段，Client 只修改自己负责的字段路径。

## 标准流程

### 1. 定义包与装配关系

准备：

- `package.json`：声明 `main`、`exports`、`files`、`dsh.bundle.patch` 和可选的 `dsh.client`。
- `cordis.patch.yml`：插入唯一插件 ID。
- `src/index.ts`：Host 入口；Client-only 时可以是无副作用的空实现。
- `src/client/index.tsx`：浏览器插件入口。

若插件接受配置，同时导出 `Config` 类型与同名 Schemastery Standard Schema；默认值和约束写进 Schema，让无效配置在加载时失败。不同部署可能变化的参数不得硬编码。这是官方[插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)契约。

按 [package-and-build.md](references/package-and-build.md) 建立结构。Cordis patch 的 `name` 与安装包名一致，ModuleLoader ID 与包名精确一致；Cordis patch 的 `id` 只需在组合树中唯一，可以使用不带 scope 的短 ID。

插件包声明 `dsh.bundle`，用户 profile 声明 `dsh.profile`；一个包不能同时承担两者。patch 覆盖已有行时会替换整段 `config`，不会深合并。安装后先执行 `dsh --profile <name> --dump-config` 核对最终组合。见官方[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

### 2. 分清四层依赖

不要把下面四层当成同一份列表：

| 层 | 表示什么 | 示例 |
| --- | --- | --- |
| Client `export const inject` | Cordis 运行时服务名 | `slots`、`locale`、`connection` |
| `dsh.client.inject` | 提供这些服务的 Client 模块及启动关系 | `@deepseek-ai/dsh-client-ui-slots` |
| bundle 的 `require(...)` | externalize 后由 Web ModuleLoader 提供的值模块 | `react`、UI primitives |
| npm 依赖字段 | 安装、运行兼容和本地编译关系 | dependencies、peer、devDependencies |

只声明真正使用的服务和启动边。常见 Cordis 服务包括：

- `slots`：插入 UI。
- `locale`：注册多语言文案。
- `theme`：读取主题或覆盖 Token。
- `remote`：调用 Host 暴露的类型化接口。
- `settingsScope`：仅在当前 Harness 确实向 Web 暴露该命名空间时使用。

值导入才会形成 bundle `require(...)`；`import type` 编译后消失。实际 `require(...)` 必须存在于当前 Web 平台共享模块表中，但不要求与 `dsh.client.inject` 一一相等。不要复制另一个大型插件的整份依赖清单。详见 [package-and-build.md](references/package-and-build.md)。

硬依赖写入 `inject`；可选能力使用 `ctx.get()` 并处理缺失。通过 Cordis API 建立的监听、服务、工具和子插件已经属于 effect；只有外部连接、watcher、第三方订阅等 Cordis 不管理的资源才包进 `ctx.effect()`。异步 disposer 必须等待资源真正停稳；严格的清理顺序放进同一个 effect。见官方[插件与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md)。

### 2b. 工具、长任务与工作台数据

面向模型的工具走官方[开发一个工具](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.zh.md)：`ctx.tools.register(defineTool({...}))`。`defineTool` 的 schema 会进入系统提示；Slot 是浏览器 UI 接线，[官方 Slot 注册表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.zh.md)写明它不进入模型请求。工具给人的模型调用，Slot 给人点；两者共用同一个 Host 服务，不要长成两套模型。没进 system prompt、工具结果或 UI 的设置项是死字段。

长任务不要把 `execute` 阻塞到结束。官方[工具编写参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.zh.md)要求用 `ctx.jobs.start`，成功的后台分支返回 `{ kind: 'background', jobId }`；约定见[后台任务运行时](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/jobs.zh.md)。

官方 [API Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md) 的 Remote 只处理一元请求和一元结果，没有推送。磁盘或任务要近实时，就在 Host 失效缓存并增加 `revision`，Client 轮询廉价状态方法。

下面是文件工作台的项目约定，不是官方 API：产品正文以磁盘（或另一个明确的外部所有者）为真源；overlay / 插件状态只记工作台标记，不复制一份目录。Gateway 调用的是 Cordis 上注册的实时服务；基线观察是 Remote 服务不要用 `#private` 字段。

### 3. 通过 Slot 扩展 UI

先从当前版本的 Slot Catalog 选择最窄的 Slot，再调用：

```ts
ctx.slots.inject("settings.section", () =>
  ctx.slots.register(
    {
      name: "settings.section",
      id: "example-plugin",
      order: 100,
      label: () => t("nav"),
      store,
      locale: NS,
      inject: bindActions,
    },
    SettingsPage,
  ),
);
```

必须先 `slots.inject()`，因为 Slot 可能在插件加载后才被宿主声明。不要复用官方条目的 ID，除非目标就是替换该条目。自定义检查器走官方 Catalog 里的 `shell.overlay`（list、可叠加、默认穿透点击）。不要调用 `layout.openDetails`：那会打开官方 `details` 列，该列由对话详情面板占用，不是插件检查器。替换整个 `sidebar` 时必须重声明它的子槽位，否则官方 Catalog 写明子座会随替换一起消失。详见 [client-slots-and-theme.md](references/client-slots-and-theme.md)。

Slot 是公开扩展位，不代表宿主内部 React 组件也已公开。只从包的公开 `exports` 导入运行时组件，不 deep import 源码或未导出的官方卡片。优先复用公开 primitives 和语义 Token；确实没有公开组件时，才实现最小的插件自有外壳，并使用根类名隔离 CSS。

### 4. 使用官方 Theme API

主题插件通过 `ctx.theme.overrideTokens(source, overrides)` 修改语义 Token，并保存返回的释放函数。每次更新时先替换旧覆盖，插件卸载时释放：

```ts
let release = () => {};

function applyTheme(overrides: ThemeTokenOverrides) {
  const nextRelease = ctx.theme.overrideTokens("example-plugin", overrides);
  release();
  release = nextRelease;
}

ctx.effect(() => () => release(), "release theme overrides");
```

不要按组件类名逐个改颜色。让按钮、Tab、消息、输入框等继续消费 Harness 的语义 Token，才能同时覆盖浅色、深色和后续新增界面。

### 5. 分开保存普通设置与敏感凭据

先确定用户期望：

- 只在当前浏览器和来源生效：使用带版本号的 `localStorage` key，并做解析、迁移与损坏回退。
- 跟随 Harness profile 或需要多端同步：先通过 Remote 可行性门禁；只有目标版本支持独立插件自包含生成并挂载通路时，才实现 Host Settings/Remote。
- 使用 Harness `settingsScope`：必须先验证 `settings.describe` 能看到插件命名空间。

当前基线 commit 的 Web Settings RPC 使用显式暴露集合，第三方 Host Settings namespace 不会因注册而自动暴露给浏览器。不要只因 Host 注册成功就判断 Client 可以绑定。具体证据和降级路径见 [persistence-and-release.md](references/persistence-and-release.md)。

普通设置遵循官方 [Settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.zh.md) 与 [Web API Proxy](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/apiproxy/README.zh.md)：

- 使用路径级 `settings.mutate`，只修改插件拥有的字段，不覆盖整个 namespace。
- 携带 `expectedRevision`；发生冲突时保留草稿并提示刷新，不盲目重试。
- 只有插件确实替换并维护某个官方 schema 时，才可复用其已暴露 namespace。独立插件不得占用官方 namespace。

API Key、Token 等敏感值必须进入 Harness Credentials。官方[凭据](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.zh.md)与[配置模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)约定：Client 只通过 `credentials.describe` 查看状态，通过 `credentials.set` 写入；Host 在每次操作的最后使用点 `resolve`；页面永远收不到明文，settings 只保留引用。密钥落在 `$DSH_HOME/.credentials.yaml`。

Credentials 与 Settings 是两个独立事务，不能伪造成原子保存。按依赖关系决定顺序：若 Settings 先创建 credential ref，先写 Settings；若设置校验要求凭据已经存在，先写 Credentials。后一步失败时保留已提交状态，只重试剩余步骤，并明确报告部分成功。

### 6. 正确构建浏览器 bundle

Client bundle 需要包装为 Harness 的 ModuleLoader 模块，并把 Harness 已提供的浏览器模块 externalize。编译所需包放入 `devDependencies`；Host 的值导入根据宿主是否提供选择 `dependencies` 或 `peerDependencies`。`dsh.client.inject` 只描述 Client 模块启动关系，不能替代 npm 依赖或 bundler external 配置。

不要为了消除编译问题，把所有宿主模块复制进 bundle。那会产生重复 React、Context 断裂、包体膨胀或运行时不兼容。

构建后提取 `lib/client.js` 中真实的 `require(...)` 集合，并与目标版本 Web 共享模块表逐项核对。所有会影响结果的实时设置都要进入缓存 key；切换 provider、model、baseURL 或路由后不得复用旧结果。

### 7. 验证

至少执行：

```bash
pnpm typecheck
pnpm test
pnpm build
node "$SKILL_DIR/scripts/check_plugin.mjs" /path/to/plugin
dsh --profile <name> --dump-config
```

`SKILL_DIR` 是本 Skill 的安装目录。契约（方法名、zod schema、`dsh.client.inject`、patch 行）变了必须重启 Harness 进程，再硬刷新浏览器；只改已有方法内部实现时，重建 `lib/` 通常就够。

然后检查：

- `main` 和 Cordis patch 指向的文件存在。
- `lib/client.js` 包含 `window.__ModuleLoader__.load(...)`。
- Client 注入服务与实际使用一致。
- 页面打开、关闭、插件卸载后没有残留样式或事件。
- 刷新后状态符合约定。
- 浅色、深色、窄窗口和长文案均正常。
- 控制台和 Client load report 没有注入、Slot 或模块解析错误。
- Client bundle 的 ModuleLoader ID 与包名一致，真实 `require(...)` 都由目标 Web 平台提供。

测试分四层：包内单测、源码面真实入口集成、构建产物 smoke、组合与人可见界面验收。不要只断言内部方法被调用；要验证最终文件、进程、manifest、事件或页面确实发生了预期变化。高风险生命周期和清理代码同时核对官方[测试策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.zh.md)与[防御性模式](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.zh.md)。

没有用户明确要求时，不使用浏览器自动化；可先做构建、静态检查和 HTTP/manifest 只读验证。

安装到真实 profile 后还要验证：

1. lockfile 锁定到预期 GitHub commit。
2. 重启 Harness，并轮询端口与 HTTP，避免用一次请求误判启动失败。
3. 检查 `window.__DSH_BOOT__` 或等价 boot manifest 中存在插件、revision 和 inject 边。
4. 直接请求插件 `client.js`，确认服务端提供的是新产物。
5. 刷新浏览器页面，再检查 UI 和 Client load report。服务端模块图通常需要重启，浏览器 boot manifest 通常需要刷新。

pnpm peer warning 只表示 profile 组合中的依赖声明不完整，不等于运行失败。最终以 Host 启动、boot manifest、bundle `require(...)` 和 Client load report 为准。

### 8. 发布与安装

官方[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)支持三条路径：npm 预构建包、`pnpm pack` 生成的 tarball、Git 源码包。Git 源码安装若依赖构建，作者必须提供自包含 `prepare`，用户还要在 profile 的 `pnpm-workspace.yaml` 中通过 `allowBuilds` 授权安装期代码执行。

本 Skill 验证过另一种 GitHub 项目约定：把 `lib/index.js`、`lib/client.js` 和 Cordis patch 提交进仓库，使入口无需安装期构建即可运行。无论采用哪条路径，都要保证产物位于 `files` 中，并执行 `npm pack --dry-run` 或 `pnpm pack` 核对真正交付的文件。只通过 GitHub 发布时不必发布 npm 包。

官方教程里的安装命令是 `dsh plugin --profile <name> add github:owner/repository`。官方根 README 的 npm 入口是 `npx @deepseek-ai/dsh`，未全局安装 CLI 时写成：

```bash
npx @deepseek-ai/dsh plugin --profile <name> add github:owner/repository
```

教程示例 profile 是 `demo`；`web` 只是常见产品 profile 名，不是官方默认值。可复现或高安全安装使用 `github:owner/repository#<sha>` 锁定提交。`prepare` 在 agent 沙箱之外运行，只能对可信源码授权。安装后重启 Harness。完整的发布、重装和问题排查清单见 [persistence-and-release.md](references/persistence-and-release.md)。

## 评审原则

按以下优先级处理问题：

1. 插件能否被 Cordis 发现并正常加载。
2. 是否使用当前版本真实存在的公开接口。
3. 是否独立安装，不要求用户修改 Harness 源码或白名单。
4. 是否有完整清理逻辑，不污染其他插件。
5. 是否有类型检查、测试、构建和安装验证。
6. Settings 更新是否有 revision 防护，Credentials 是否保持只写且不泄露。
7. 替换型插件是否保留原有能力和公开契约。
8. UI 是否复用公开 primitives、语义 Token，并支持主题和响应式。
9. 文档中的安装命令是否与实际发布方式一致。

遇到 Harness 缺少公开扩展点时，明确说明限制，并在以下方案中选择：

- 缩小功能，使用现有公开 API。
- 在目标版本支持自包含生成与挂载时，在插件内部增加 Host Remote 能力。
- 向 Harness 提交通用扩展点。

不要把修改 Harness 核心代码伪装成“独立插件”。

## 维护本 Skill

修改本 Skill 后运行：

```bash
python3 "$SKILL_CREATOR/scripts/quick_validate.py" "$SKILL_DIR"
node --test "$SKILL_DIR/scripts/"*.test.mjs
node "$SKILL_DIR/scripts/check_references.mjs" "$SKILL_DIR" --harness /path/to/deepseek-harness
```

`$SKILL_DIR` 为本目录。有 Codex skill-creator 时，`$SKILL_CREATOR` 指向它的 `scripts` 上一级。

引用检查必须以目标 Harness checkout 运行；只检查 URL 字符串是否存在不足以证明版本兼容。
