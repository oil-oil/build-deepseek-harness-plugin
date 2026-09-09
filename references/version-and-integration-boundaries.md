# 版本与装配边界

## 目录

- [当前核对基线](#当前核对基线)
- [版本分界](#版本分界)
- [五种不能混用的依赖](#五种不能混用的依赖)
- [配置层与产品启动器](#配置层与产品启动器)
- [高风险破坏点](#高风险破坏点)
- [升级核对流程](#升级核对流程)

## 当前核对基线

最后核对日期：2026-09-09。npm `latest` 为 `0.1.2-rc.1`（commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`），npm `alpha` 为 `0.1.5-alpha.1`（commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`）。两条发布通道分别核对，不能把 alpha 的接口直接用于桌面内置稳定版。

- [稳定版 CLI 版本](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/apps/cli/package.json)
- [稳定版 Web 平台模块表](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/packages/client/web/src/platform.ts)
- [alpha Web 平台模块表](https://github.com/deepseek-ai/deepseek-harness/blob/5dda764ed3aa172535a7967b06ff95d9cbfe536a/packages/client/web/src/platform.ts)
- [稳定版 Store 公开入口](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/packages/client/store/src/index.ts)
- [稳定版 Renderer 与 Context 类型](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/packages/client/ui-renderer/src/client/index.ts)
- [稳定版 Slot Catalog](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts)
- [稳定版 Settings Controller](https://github.com/deepseek-ai/deepseek-harness/blob/a66e4702047846cdaa10c66c9d3df3951f5ea70d/packages/api/settings-controller/src/index.ts)

社区 DSH Desktop `2.0.5` 的已安装产物内置 Harness `0.1.2-rc.1`。已用该安装包的真实 ModuleLoader、React 和 Store 验证主题插件加载；alpha 已核对源码模块表与 Renderer 类型，尚未做真实窗口验收。

Harness 仍是 Developer Preview。上面只是本 Skill 的维护基线，不是插件可以无条件声明的兼容范围。每个任务仍要记录实际 commit、`@deepseek-ai/dsh` 版本、profile、启动宿主和锁文件解析结果。

## 版本分界

| 版本 | commit | Settings namespace | Client 模块图 | 迁移影响 |
| --- | --- | --- | --- | --- |
| `0.1.0-rc.5` | `47f943859bef60e4160492346772ded9b24f765a` | Web 只暴露显式集合 | 无 `dsh.client.external` | 第三方 namespace 不能只靠注册进入 Web；共享值模块按旧表核对 |
| `0.1.0-rc.7` | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | Web 返回全部已注册 namespace 的脱敏描述 | 无 `dsh.client.external` | 第三方 Settings 可经 `settings.describe` 发现，但配置 API 仍受 loopback 信任边界约束 |
| `0.1.0-rc.8` | `141eb6fef83422698aef7a981029e843e8161534` | 同 rc.7 | 引入 `dsh.client.external` | 非基线值模块必须声明精确 specifier；模块请求图必须无环；Slot Catalog 新增 sidebar 品牌座位 |
| `0.1.1-rc.1` | `528c682e061696f5a160f363f236ecbf53cbd006` | 同 rc.7 | 同 rc.8 | Credentials 增加 record/authorization 键空间 |
| `0.1.1-rc.2` | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | 全部已注册 namespace | `external` 约束代码到达顺序 | 延续上述契约；仍需按目标 Catalog 与包 manifest 核对 |
| `0.1.2-rc.1` | `a66e4702047846cdaa10c66c9d3df3951f5ea70d` | Settings Controller 返回已注册 namespace 的脱敏描述 | 移除 runtime 预加载，新增 `client-store` 平台模块 | `defineStore` 与 Context 导入必须迁移；`slots` 类型来自 Renderer |
| `0.1.5-alpha.1` | `5dda764ed3aa172535a7967b06ff95d9cbfe536a` | 按目标 Controller 核对 | 平台表在上述基础上新增 `ui-dockkit` | 不能把 alpha 新模块当作稳定版 baseline |

不能只比较 SemVer。桌面应用、全局 CLI 和 profile lockfile 可能各自携带不同 Harness 版本；以实际启动进程加载的包为准。

## 五种不能混用的依赖

| 声明 | 单位 | 决定什么 | 不决定什么 |
| --- | --- | --- | --- |
| Client `export const inject` | Cordis 服务名 | fiber 等待哪些运行时服务 | npm 安装、模块代码到达 |
| `dsh.client.inject` | Client 包名 | preflight/HMR 使用的信息图 | Loader 行启停、Client apply 顺序 |
| `dsh.client.external` | 精确模块 specifier | rc.8+ 非基线同步 `require` 的供应与代码到达顺序 | Cordis 服务激活 |
| 构建产物 `require(...)` | 模块 specifier | ModuleLoader 实际必须提供的值 | Cordis 服务关系 |
| npm dependency/peer/dev | npm 包 | 安装、兼容与编译关系 | Web ModuleLoader 是否已注册工厂 |

`dsh.client.inject` 从来不是“启用另一个 Loader 行”的开关。一个包是否进入 `window.__DSH_BOOT__`，取决于最终组合中是否存在启用的 Loader 行、该包是否声明 `dsh.client`，以及 `exports["./client"]` 是否可读。

baseline 按完整版本选择：`0.1.1-rc.2` 仍预加载 runtime client；`0.1.2-rc.1` 已移除它，平台表提供 React、React DOM、Cordis、`client-store`、`ui-slots` 和 `ui-primitives`。`0.1.5-alpha.1` 额外提供 `ui-dockkit`。不要把这些名字重复写进 `dsh.client.external`。非基线值导入才写 `external`；类型导入会被擦除，不形成模块请求。

### Client runtime 迁移

在 `0.1.2-rc.1` 与 `0.1.5-alpha.1` 中，`defineStore` 从 `@deepseek-ai/dsh-client-store` 的公开根入口导入，Context 类型从 `@deepseek-ai/cordis` 导入。`ctx.slots` 的声明合并由 `@deepseek-ai/dsh-client-ui-renderer/client` 提供，使用 `import type {}` 引入；`ui-slots` 的注册契约与 Renderer 的服务类型不是同一层。

遇到 `missed the module table`，先从实际运行 bundle 提取 `require(...)`，再对照目标 `platform.ts`。仅安装旧包、添加 `inject`/`external` 或改缓存都不能恢复已移除的宿主接口；迁移源码、编译依赖与构建产物，然后更新实际 profile 并重启。

## 配置层与产品启动器

官方 CLI 的标准顺序是：

```text
bundle patches
  → profile/cordis.patch.yml
  → $DSH_HOME/cordis.patch.yml
  → argv --patch
```

桌面封装可以在这之后再追加产品层。此时普通 CLI 的 `--dump-config` 只能证明 CLI 标准组合，不能单独证明桌面进程的最终 Loader 图。

已验证的 DSH Desktop 2.0.2 产品观察：`advanced` 模式会在 bundle/profile/home 层之后再次设置 `ui-layout.disabled = true`、`ui-sidebar.disabled = false`、`ui-conversation.disabled = false`。因此一个在自己 patch 中禁用官方 sidebar、并重声明 `sidebar.workspaces` 的插件，会在 advanced 模式重新与官方 sidebar 同时加载并触发 `slot ... is already declared`。`compatibility` 模式不施加这组三行所有权覆盖。

这不是 DeepSeek Harness 官方通用契约，也不能外推到其他 Desktop 版本。碰到桌面宿主时必须记录应用版本与模式，并检查该版本的最终 generation、boot manifest 或 launcher 诊断。

## 高风险破坏点

- **single Slot 所有权迁移**：禁用官方 Loader 行、重声明全部必要 children、验证旧能力清单，三者缺一不可。
- **产品层反向覆盖**：Desktop 或其他 launcher 可以在用户 patch 之后重新启用官方行；只看插件 patch 会误判。
- **旧版 Settings 结论外推**：rc.5 的 namespace 白名单不能用于 rc.7+；反过来，支持 rc.5 的插件也不能假设第三方 namespace 可见。
- **`inject` 与 `external` 混用**：前者不排序代码，后者不提供 Cordis 服务。把值模块只写进 `inject` 会在 rc.8+ 留下同步 `require` 失败。
- **模块图环**：Cordis 服务依赖允许等待，`external` 的同步模块请求图拒绝环。
- **Catalog 漂移**：single Slot 的 children、owner props 和已占用 cell 会增加。替换外壳必须按目标 commit 重做能力清单。
- **Remote 自动发现假设**：当前官方 Client Remote 聚合仍是构建期静态 contributions。独立包的 Host `@Remote` 不会自动变成 `ctx.remote.<namespace>`；要么交付并显式 `$mount` 同一份 descriptor，要么使用已公开 Settings/API。
- **重启边界**：包 metadata、Loader 行、schema、Remote descriptor 或 `dsh.client.external` 变化后必须重启；只刷新页面不足以更新 Host 扫描缓存。

## 升级核对流程

1. 记录目标 commit、CLI 版本、profile lockfile、启动宿主版本和宿主模式。
2. 对比 `apps/cli/package.json`、Client manifest wire、平台 baseline、Slot Catalog、Settings Controller 和 Credentials 文档。
3. 检查器用 `--harness-version <完整版本>` 选择已核对表；未知版本先补源码证据，不能自动套用旧表。列出所有 `require(...)`：基线项、显式 `external` 项和插件私有 bundle 项必须能一一归类。
4. 分别检查标准 CLI 组合与宿主最终组合；若宿主有后置 patch，记录它覆盖了哪些 Loader 行。
5. 检查 boot manifest 的最终 entry、`external`、revision 与 bundle URL，再看 Client load report。
6. 对 single Slot 做“声明者唯一性 + 原能力清单 + 卸载恢复”验收。
7. 把新发现写成版本分支，并给检查器补回归用例；不要把单次故障写成永久 API。
