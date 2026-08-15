# 官方规范与核对入口

本页用于区分“官方稳定契约”“当前版本源码事实”和“项目实战约定”。最后核对基线：DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a`（commit 日期 2026-08-13，核对日期 2026-08-14）；该提交的根包与 `@deepseek-ai/dsh` CLI 都标记为 `0.1.0-rc.5`。Harness 仍处于 Developer Preview，每个任务都要重新记录目标 commit、实际安装版本和 profile，不能只写一个版本号。

## 目录

- [官方入口](#官方入口)
- [实践与证据映射](#实践与证据映射)
- [证据优先级](#证据优先级)
- [先区分两类插件](#先区分两类插件)
- [插件与生命周期](#插件与生命周期)
- [Config 官方契约](#config-官方契约)
- [能力 seam 与依赖](#能力-seam-与依赖)
- [bundle、profile 与配置层](#bundleprofile-与配置层)
- [Web Client 与样式](#web-client-与样式)
- [安装与供应链安全](#安装与供应链安全)
- [测试边界](#测试边界)
- [每次升级后重新核对](#每次升级后重新核对)

## 官方入口

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)
- [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)
- [Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.zh.md)
- [能力的三种角色设计](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/index.zh.md)
- [扩展插件形态实操手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.zh.md)
- [Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)
- [Client Slot 注册表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.zh.md)
- [Slot Catalog 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts)
- [Theme 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.zh.md)
- [Web UI 样式规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)
- [Settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.zh.md)
- [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.zh.md)
- [Web API Proxy](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/apiproxy/README.zh.md)
- [API Gateway 与 Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md)
- [测试策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.zh.md)
- [防御性模式](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.zh.md)

这些 `master` 链接用于找到官方入口，不是版本证据。本地有官方仓库时，优先读同一提交下的文件和生成 Catalog；需要记录某项版本观察时，使用 commit 固定链接，例如[基线 Slot Catalog](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts)。

## 实践与证据映射

| 实践 | 优先证据 |
| --- | --- |
| 插件生命周期、`inject`、effect 与 disposer | Cordis 入门、`docs/cordis-api/`、目标提交源码 |
| Config、bundle、profile 与 patch 层 | 插件配置、打包与安装 |
| Client boot graph、bundle URL、revision 与 HMR | Client 模块、`packages/client/modules` |
| Slot 类型、scope、props、占用与替换风险 | 目标提交生成的 Slot Catalog、Client Slot 注册表 |
| Theme API、Token 与样式职责 | Theme 服务、Web UI 样式规范、目标提交类型定义 |
| Settings 暴露范围与 revision 写入 | Settings、Web API Proxy、`settings.describe` 实际结果 |
| Credentials 只写边界 | Credentials、Web API Proxy |
| Client→Host Remote | API Gateway、目标业务包生成的 `/remote` 贡献 |
| 测试与资源清理 | 测试策略、防御性模式 |

## 证据优先级

出现冲突时按以下顺序判断：

1. 目标运行时导出的类型、实际源码、生成的 Cordis Catalog 和 Slot Catalog。
2. 与目标提交一致的官方子系统文档、教程和官方插件实现。
3. 官方仓库 `master` 上的文档。
4. 本 Skill 的实战经验和项目约定。

某个 rc 版本、Web profile 或官方插件的行为只能标记为“版本观察”，不能写成永久 API。版本号、commit 和已安装 lockfile 不一致时全部记录，并以实际运行产物为最终依据。

## 先区分两类插件

| 路径 | 用途 | 关键限制 |
| --- | --- | --- |
| 动态 Cordis Plugin/Package | 在 Harness 会话中快速定义、运行、更新和回滚 | Host/Client 是纯 JavaScript 函数体；先通过 Inspect Provider 查询真实 API；不能使用 import、JSX 或 TypeScript |
| 可分发组合包 | 通过 npm、tarball 或 GitHub 安装到 profile | 需要 `package.json`、`dsh.bundle`、Cordis patch、Host 入口；Web 插件还要提供 ModuleLoader Client bundle |

本 Skill 默认处理可分发组合包。若任务明确使用 `cordis_define` / `cordis_run`，先读取官方内置 `cordis-plugin-development` Skill，不要把两套产物格式混用。

## 插件与生命周期

官方依据：[Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.zh.md)、[Fiber API](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/fiber.zh.md)。

- 插件可使用函数、对象或 Service 类三种形态；普通扩展优先函数形态，提供可替换服务时再考虑 Service 类。
- 硬依赖写入 `inject`。依赖缺失时 fiber 保持 `PENDING`，不是“成功但没有输出”。可选依赖使用 `ctx.get(name)` 并处理 `undefined`。
- 通过 `ctx.on()`、`ctx.plugin()`、服务注册、工具注册等 Cordis API 建立的贡献已经属于 effect，会随 fiber 自动撤销。
- 只有 Cordis 不管理的连接、watcher、第三方订阅等资源才需要 `ctx.effect(() => disposer)`。
- disposer 必须让资源真正停稳；异步清理要等待子任务退出。多个异步 disposer 会并发启动，需要严格顺序时放在同一个 disposer 内依次等待。
- 配置或依赖变化会卸载旧实例并重新加载，模块级全局副作用会绕过这条边界，禁止使用。

## Config 官方契约

官方依据：[插件配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.zh.md)。

需要配置的插件同时导出：

```ts
export interface Config {
  timeoutMs: number;
}

export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().default(30_000),
});
```

- 同名 `Config` 值必须是 Standard Schema，不能只是普通对象。
- 默认值和约束写入 Schema，让无效配置在加载时响亮失败。
- 不同部署可能变化的值必须成为配置字段，不能写死在实现中。
- 跨字段约束优先使用 Settings/服务公开的校验入口，不要存入一个 owner 无法执行的状态。

## 能力 seam 与依赖

官方依据：[能力的三种角色设计](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/practice/index.zh.md)、[扩展插件形态实操手册](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.zh.md)。

- 先在当前版本的 Service/Event/Slot/Theme Catalog 中定位最窄扩展点，不根据服务名或截图猜完整 API。
- 通用且需要可替换提供方的能力可拆成 Service Definition、Provider、Consumer；简单插件不要预防性拆包。
- Provider 与 Consumer 都依赖 Definition，彼此不直接依赖。
- Slot props 已经拥有的数据直接从 props 读取；不要为了重复取数新增 Host RPC。
- Client→Host 私有通信只传无损 JSON，不传 Context、Service、React Element、类实例或其他内部活对象。

## bundle、profile 与配置层

官方依据：[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

- 组合包声明 `dsh.bundle.patch`，回答“贡献什么”。
- profile 声明有序的 `dsh.profile.bundles`，回答“启动哪些组合包”。
- 一个包不能同时是 bundle 和 profile。
- 生效顺序是：各 bundle patch → profile patch → home patch → argv `--patch`；后层胜出。
- patch 命中已有行时会替换该行的完整 `config`，不会深合并。覆盖方必须重述所有必需字段。
- 插件默认值应允许用户在 profile patch 中继续覆盖。
- 启动前先运行 `dsh --profile <name> --dump-config`，确认层顺序、行 ID 和完整配置。

## Web Client 与样式

官方依据：[Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)、[Client Slot 注册表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.zh.md)、[Theme 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.zh.md)、[Web UI 样式规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)。

- 包通过 `dsh.client.platform = "web"`、`exports["./client"]` 和可选 `dsh.client.inject` 进入 `window.__DSH_BOOT__`。
- entry `id` 等于包名；bundle 的内容哈希形成 `rev`。插件集合变化通常需要重启，bundle 内容变化才走 HMR rebuild。
- Feature UI 使用 CSS Modules、语义 `--dsw-alias-*` Token 和已有 typography；不要复制静态色值、在组件 CSS 中写 light/dark 分支或增加另一套全局主题。
- 字号与行高成对设置；保留键盘焦点和 reduced-motion 行为。
- 全局主题改 Theme Token；插件自有组件样式使用隔离 CSS。Theme 不创建 UI，Slot 不替代 Theme。

## 安装与供应链安全

官方依据：[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

官方支持三种主要交付方式：

1. npm：发布前构建，用户安装预构建产物。
2. tarball：作者执行 `pnpm pack`，用户安装 `.tgz`。
3. Git：仓库提供自包含 `prepare`，用户在 profile 的 `pnpm-workspace.yaml` 中通过 `allowBuilds` 授权安装期代码执行。

直接在 Git 仓库提交 `lib/`，让入口无需安装期构建即可运行，是已验证的项目约定，但不是官方教程的主路径。无论采用哪种方式，都要用 `npm pack --dry-run` 或 `pnpm pack` 检查真正交付的文件。

`prepare` 在 agent 沙箱之外执行。只对可信仓库授权，并在可复现或高安全场景使用 `github:owner/repo#<sha>` 锁定提交。

## 测试边界

官方依据：[测试策略](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.zh.md)、[防御性模式](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.zh.md)。

至少覆盖四层：

1. 包内单元测试：配置规范化、迁移、状态机和纯函数。
2. 源码面集成测试：通过真实服务与真实入口验证，不只检查自报状态。
3. 构建产物 smoke：用普通 Node/浏览器加载实际 `lib/`，防止源码运行器掩盖模块解析和构建错误。
4. 组合与界面验收：`--dump-config`、Host 启动、boot manifest、Client load report；人可见变化补对应截图或交互场景。

测试应验证“外部世界真的发生了什么”，而不是只断言内部方法被调用。

## 每次升级后重新核对

- 目标 commit、包版本和 profile 名称。
- Config、Service、Event、Slot、Theme Token 的实际类型和 Catalog。
- Web ModuleLoader 共享模块表与 Client bundle 的真实 `require(...)`。
- Settings namespace 是否向 Web 暴露，Credentials 的 describe/set/resolve 契约。
- 独立安装包的 `/remote` contribution 是否会被 Client 组合发现并挂载。
- Settings、Credentials、目录选择和本地文件能力的 loopback/trust 边界。
- Git 安装策略、pnpm 版本和 `allowBuilds` 行为。
- HMR、boot manifest、重启与刷新边界。
