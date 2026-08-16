# 持久化、安装与发布

## 目录

- [先选择状态范围](#先选择状态范围)
- [已验证的版本限制](#已验证的版本限制)
- [浏览器本地持久化](#浏览器本地持久化)
- [profile 级持久化](#profile-级持久化)
- [Settings 安全更新](#settings-安全更新)
- [Credentials 安全边界](#credentials-安全边界)
- [实时配置与缓存](#实时配置与缓存)
- [GitHub 安装发布](#github-安装发布)
- [如何判断安装成功](#如何判断安装成功)
- [故障排查顺序](#故障排查顺序)

官方依据：[Settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.zh.md)、[Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.zh.md)、[本地凭据提供方](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/README.zh.md)、[配置模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)、[Web API Proxy](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/apiproxy/README.zh.md)、[API Gateway 与 Remote](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md)、[Typert 远程调用](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/typert.zh.md)、[打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。`master` 只用于导航；namespace 暴露范围、Remote 生成方式和 wire 契约以目标 commit 与实际运行时为准。

## 先选择状态范围

| 需求 | 方案 | 优点 | 限制 |
| --- | --- | --- | --- |
| 当前浏览器保存 UI 偏好 | 版本化 `localStorage` | 独立、简单、无需 Host 白名单 | 不跨浏览器、不跨 origin |
| 跟随 Harness profile | 插件 Host Settings + 已验证可挂载的 Remote | 可集中存储、可校验 | 当前基线的独立安装包缺少自动 Remote 挂载能力 |
| 使用 Harness 原生 SettingsScope | 先确认命名空间已暴露 | 与官方设置一致 | 某些版本过滤第三方 namespace |

## 已验证的版本限制

在基线 commit `47f943859bef60e4160492346772ded9b24f765a`（仓库包版本 `0.1.0-rc.5`）中：

- Host 侧可以注册第三方 Settings namespace。
- Web Settings RPC 只返回显式暴露集合：固定的 `WEB_SETTINGS_NAMESPACES`，加上当前版本明确纳入的可配置 provider namespace；普通第三方注册不会自动加入。
- 因此 Client 调用 `ctx.settingsScope.bind({ namespace: "third.party" })` 并不代表浏览器一定能读写该 namespace。
- [Client Remote 聚合](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/remotes/src/client/index.ts)在 Harness 构建期静态选择并挂载固定的 `/remote` contributions；独立安装包只在 Host 声明 `@Remote`，不会让 `ctx.remote.<namespace>` 自动出现。
- Settings/Credentials 配置面仅允许 loopback；非 loopback 浏览器的 [SettingsScope](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings/src/client/settings-scope.ts)会降级为进程内 memory，而不是跨机器同步。
- 重新加载后设置消失，常见原因就是 Client 从未真正拿到可持久化 namespace。

版本升级后必须重新查看 [`packages/host/apiproxy/README.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/apiproxy/README.zh.md)、`packages/host/apiproxy/src/api-proxy.ts` 和 `settings.describe` 的实际返回。不要把该基线的限制永久写死，也不要要求普通用户修改白名单。

## 浏览器本地持久化

适合主题、字体、密度等只影响当前 Web 界面的偏好。

```ts
const STORAGE_KEY = "example-plugin/settings/v1";

export function loadSettings(storage: Storage): Settings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: Storage, value: Settings): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
```

要求：

- key 带插件名和 schema 版本。
- 读取后经过字段白名单、类型校验和颜色格式校验。
- 新版本提供迁移，不直接信任旧 JSON。
- Storage 被禁用或超限时，UI 显示保存失败但仍允许临时预览。
- 测试空值、损坏 JSON、旧版本和非法字段。

注意：`http://127.0.0.1:3080` 与其他端口、域名、协议是不同 origin，数据不会共享。

## profile 级持久化

若需要跨浏览器窗口、与 CLI 共用或存储敏感信息，理论上使用 Mixed 插件；但必须先通过下方 Remote 可行性门禁。当前基线的独立 GitHub 安装包不能只靠自有 `@Remote` 自动打通 Client→Host：

1. Host 注册插件自己的 Settings schema 或存储服务。
2. Host 暴露最小的类型化 Remote，例如 `getThemeSettings`、`setThemeSettings`。
3. Client 只通过 `remote` 调用，不读取服务器文件路径。
4. Host 校验所有输入，写入失败返回结构化错误。
5. 敏感值交给 Harness credentials 能力，不放 `localStorage`。

### Remote 可行性门禁

Host 注册服务不等于 Client 自动获得 `ctx.remote.<namespace>`。开始实现前先按官方 [API Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md) 核对：

1. Host 方法是否通过目标版本公开的 `@Remote` / `@RemoteScope` 约定声明。
2. 构建是否生成并交付 Host 描述符和 `/remote` Client contribution。
3. Client 组合是否显式挂载该 contribution，并把对应服务加入真实启动边。
4. 请求与结果是否为可校验、无损 JSON；不要跨 wire 传 Context、Service、React Element 或类实例。
5. 独立仓库能否自包含完成生成和构建；若依赖 Harness monorepo 私有构建步骤，就不能宣称可独立安装。

若目标版本不允许外部插件可靠挂载自己的 Remote，选择浏览器本地持久化、已有公开 Settings namespace，或向 Harness 提交通用扩展点；不要用私有 HTTP 路由、DOM 通道或修改 Host 白名单冒充官方 Remote。

独立仓库也可以手写 invocation descriptor（zod codec + `TypertRemoteService`），再导出 `./typert` 并在 Client 里 `ctx.remote.$mount(...)`。这是已验证的项目约定，不是官方 [API Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.zh.md) 生成流水线的替代文档。Host 与 Client 必须同一套方法与 schema。改契约后要重建两端、**重启** `dsh` 进程，再硬刷新浏览器。官方 Gateway 只处理一元请求和一元结果，没有推送；磁盘或任务要近实时，就由 Host 失效缓存并增加 `revision`，Client 轮询廉价状态。Gateway 调用的是 Cordis 上注册的实时服务；基线观察是 Remote 服务不要用 `#private` 字段，官方文档没有单独写这条。

本地开发可以把 `lib/` hardlink 或 `file:` 链到 `$DSH_HOME/profiles/<name>/node_modules/<pkg>`，这样 `pnpm build` 会更新运行树。只改已有方法内部实现通常不必重启；改 schema / 方法名 / `dsh.client.inject` / patch 行必须重启。

## Settings 安全更新

Client 能从连接层 `settings.describe` 看到目标 namespace 后，仍要避免整对象覆盖：

1. 读取 snapshot 的 `value` 和 `revision`。
2. 表单只维护插件拥有的字段。
3. 保存时生成路径级 ops，并调用 `settings.mutate`。
4. 携带 `expectedRevision`。
5. 成功后以服务端返回的 value/revision 重建基线。
6. 遇到 `settings-conflict` 时保留草稿并提示用户处理外部变化，不盲目重试。

路径级 mutate 能保留未知字段、其他官方 UI 管理的字段和未来版本新增字段。插件只有在确实替换并维护某个官方插件完整 schema 时，才可复用其已暴露 namespace；独立插件不得为了绕过 Web 白名单占用官方 namespace。

## Credentials 安全边界

API Key、Token 和密码使用 Harness Credentials，不放入普通 Settings。官方[凭据](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.zh.md)与[配置模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)的约定：

```text
Client API credentials.describe(refs)
  → 只得到 configured / writable / source

Client API credentials.set(ref, value)
  → 写入新值，不读取旧值

Host ctx.credentials.resolve(credentialRef(ref))
  → 仅在真正发起请求时取得明文
```

要求：

- 输入框默认空白，只显示“已配置”状态，不把旧 Key 回传浏览器。
- Key 不进入 Settings、`localStorage`、URL、日志、错误详情、遥测和会话记录。官方用户指南写明：页面只会收到脱敏描述符，settings 只保留凭据引用，值落在 `$DSH_HOME/.credentials.yaml`。
- Host 在每个操作的最后使用点重新解析，不跨操作缓存明文。
- UI 检查 `writable`，只读来源不得显示虚假的保存成功。
- 官方[本地凭据提供方](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/README.zh.md)：进程环境盖住 `$DSH_HOME/.credentials.yaml`；来源是 `env` 时 `describe` 报 `writable: false`，`set`/`unset` 直接拒绝。
- 直接改 `.credentials.yaml` 合法。官方提供方以 `0600` 创建或原子替换文档，默认 `watch: true` 热发布外部编辑；徽章仍旧时重新打开设置卡。启动之后才 export 的环境变量不会进入解析，要换 env 凭据必须重启。

Credentials 与 Settings 属于两个独立事务，不能宣称原子保存。顺序由依赖关系决定：

| 场景 | 顺序 | 部分失败后的状态 |
| --- | --- | --- |
| 新建 provider，Settings 会创建或记录 credential ref | 先 `settings.mutate`，再 `credentials.set` | provider 已存在；锁定已提交字段，只重试凭据 |
| 既有 ref，设置校验或启用前要求凭据已存在 | 先 `credentials.set`，再写 Settings | 凭据已保存；保留设置草稿，只重试设置 |
| 两者没有依赖 | 选择一个固定顺序并把状态机写进测试 | 明确报告哪一步已提交，不重新执行成功步骤 |

不要盲目回滚已提交的步骤：回滚本身可能失败，也可能覆盖另一窗口刚更新的值。当前官方 Models UI 的新建 provider 路径采用“Settings → Credentials”，见 [`client-ui-settings-models`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-models/README.zh.md)。

## 实时配置与缓存

若插件允许运行时切换 provider、model、baseURL、路由、提示词或能力开关，所有会改变结果的字段都必须进入缓存 key。设置保存后继续命中旧结果，通常是缓存只按输入内容或附件 ID 建 key 导致的。

不要把 API Key 明文放进缓存 key。需要区分凭据版本时，使用不泄露明文的 revision、配置代号或保存后清空相关缓存。

## GitHub 安装发布

官方依据：[打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)、[官方根 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md)。先选择交付模型：

| 模型 | 作者提供 | 用户侧要求 |
| --- | --- | --- |
| npm 预构建包 | 发布前生成入口和 Client bundle | 普通 `dsh plugin add <package>` |
| tarball | `pnpm pack` 生成 `.tgz` | 安装本地 tarball |
| Git 源码构建 | 自包含 `prepare`，不能依赖旁边的 monorepo | pnpm ≥10 需要在 profile 的 `pnpm-workspace.yaml` 授权 `allowBuilds` |
| Git 仓库自带产物 | 提交并跟踪 `lib/`，入口不依赖安装期构建 | 直接 GitHub 安装；这是已验证项目约定，不是官方教程主路径 |

`prepare` 会在 agent 沙箱之外执行。用户只能对可信源码授权，并应在可复现或高安全环境锁定 commit。官方教程写的是 `dsh plugin`；官方根 README 的 npm 入口是 `npx @deepseek-ai/dsh`：

```bash
dsh plugin --profile <name> add github:owner/repository#<sha>
npx @deepseek-ai/dsh plugin --profile <name> add github:owner/repository#<sha>
```

若采用 `prepare`，profile 中需要按 pnpm 报出的确切包键配置：

```yaml
allowBuilds:
  example-plugin: true
```

发布前：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
node "$SKILL_DIR/scripts/check_plugin.mjs" .
npm pack --dry-run
git status --short
```

采用“Git 仓库自带产物”时，确认这些文件已经提交：

- `package.json`
- `cordis.patch.yml`
- `lib/index.js`
- `lib/client.js`
- README 与许可证

若只提供 GitHub 安装，不需要发布 npm。采用 `prepare` 时仓库必须能从独立 checkout 自包含构建；采用自带产物时仓库必须直接包含可运行入口。公开项目推荐 `README.md` 使用英文、`README.zh.md` 使用中文；含文字的宣传 SVG 提供对应语言版本，纯图标保持一份即可。

README 至少写清：

- 支持的 Harness 版本
- 插件做什么、不做什么
- 安装、更新、移除命令
- 数据保存位置
- 已知限制

安装。官方教程示例 profile 是 `demo`；把 `<name>` 换成用户实际 profile：

```bash
dsh plugin --profile <name> add github:owner/repository
```

未全局安装 CLI 时用同一包的 npx 入口：

```bash
npx @deepseek-ai/dsh plugin --profile <name> add github:owner/repository
```

面向普通用户可以保留无 SHA 的简洁命令，同时在安全或可复现章节给出锁定 SHA 的形式。安装后重启 Harness。若同名包已经存在或 GitHub 内容未更新，先用当前 CLI 支持的 remove 命令移除，再 add，以刷新 git tarball 和 lockfile；不要手动删除 profile 内随机目录。

## 如何判断安装成功

以下输出表示包管理器已经把包加入 profile：

```text
Packages: +1
Progress: ... added 1, done
Done in ...
```

`WARN Issues with peer dependencies found` 是依赖告警，不等于安装失败。仍需启动 Harness 检查插件是否进入 Cordis composition、Client bundle 是否加载成功。

完整验收顺序：

1. 检查 profile lockfile，确认 GitHub 依赖锁定到预期 commit。
2. 重启 Harness；进程可能被桌面父进程自动拉起，因此轮询监听端口与 HTTP，不用一次 `curl` 判断失败。
3. 页面返回 200 后，检查 `window.__DSH_BOOT__` 或当前版本等价 manifest，确认插件包、revision 和 inject 边存在。
4. 直接请求 manifest 中的插件 `client.js` URL，确认 ModuleLoader ID、版本文案或预期代码已经更新。
5. 刷新浏览器页面。服务端 Client 模块表通常在 Harness 重启时更新，浏览器 boot manifest 在页面刷新时更新。
6. 检查 Client load report 和控制台，确认没有 missing module、missing service、Slot 或初始化错误。

### 常见 peer 告警

Client 插件把 React 或 Harness Client 包放进 `peerDependencies`，而 profile 根包没有直接声明它们时，pnpm 可能提示 missing peer。按四层依赖分别判断：

1. 编译和类型检查需要的包放在 `devDependencies`。
2. Host 值导入若由 Harness 提供，可按目标官方包惯例声明 peer；否则放 `dependencies`。
3. Client 服务提供模块按实际启动关系放在 `dsh.client.inject`。
4. Client 值模块由 bundler externalize，并确认存在于 Web ModuleLoader 共享模块表。

不要为了消除告警机械删除所有 peer，也不要让用户在 Harness profile 根目录手动安装一长串内部包；两者都可能造成运行时缺包或版本漂移。以 boot manifest、真实 bundle `require(...)` 和 Client load report 判断。

## 故障排查顺序

### 插件完全没出现

1. `package.json.main` 是否存在。
2. `dsh.bundle.patch` 是否存在。
3. patch 中 name 是否等于安装包名。
4. Cordis composition 是否包含插件 ID。
5. Host 启动日志是否有模块解析错误。

### 设置入口没出现

1. `dsh.client.platform` 是否为 `web`。
2. `lib/client.js` 是否存在并进入 package `files`。
3. Client bundle 是否调用 `window.__ModuleLoader__.load`。
4. ModuleLoader ID 是否唯一。
5. `dsh.client.inject` 和 Client `inject` 是否满足。
6. Slot owner 是否已挂载，注册是否包在 `slots.inject` 中。
7. Harness 是否已经重启，浏览器页面是否已经刷新。
8. 直接请求 Client bundle 是否得到新产物，而不是缓存或旧 revision。

### 刷新后恢复默认

1. 保存函数是否真的执行。
2. storage key 与 origin 是否一致。
3. JSON 校验是否把合法值错误回退。
4. 若使用 SettingsScope，`settings.describe` 是否包含目标 namespace。
5. Host 与 Client 是否读写同一 schema 版本。
6. 保存是否使用路径级 mutate 并正确处理 revision。

### API Key 保存后仍不可用

1. UI 是否调用 `credentials.set`，而不是写入 Settings。
2. 保存的 credential ref 与 Host `credentials.resolve` 使用的 ref 是否完全一致。
3. `credentials.describe` 是否显示 configured，来源是否 writable。
4. provider 设置是否因 revision 冲突没有保存；若 Key 已成功写入，应保留设置草稿重试。
5. Host 是否在真正请求时解析凭据，而不是启动时缓存旧值。

### 更新插件后界面仍是旧版本

1. profile lockfile 是否指向新的 GitHub commit。
2. 是否执行 remove → add 刷新安装缓存。
3. Harness 是否重启，Client 模块表是否更新。
4. 浏览器页面是否刷新，boot manifest 是否更新。
5. manifest 中的 bundle URL 是否实际返回新代码。

### 样式只改到部分组件

1. 是否覆盖了正确的语义 Token。
2. 目标组件是否使用另一层 alias/component Token。
3. 是否只设置 light 或 dark 一侧。
4. 是否被后注册的 token source 覆盖。
5. 是否错误依赖类名，而不是 Theme API。

### 页面挤压、文字重叠

1. 检查设置页根容器是否遵循宿主宽度和滚动模型。
2. Grid 使用 `minmax(0, 1fr)`，子项设置 `min-width: 0`。
3. 长标签允许换行或省略，不给文本硬编码窄宽度。
4. 在中文、英文和 150% 缩放下测试。
5. SVG 卡片文字使用独立布局区域，不压在预览图上。
