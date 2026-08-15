# Client Slot、主题与界面扩展

## 目录

- [Slot 的本质](#slot-的本质)
- [常见设置 Slot](#常见设置-slot)
- [公开 UI 边界](#公开-ui-边界)
- [注册模式](#注册模式)
- [Store 与组件动作](#store-与组件动作)
- [本地化](#本地化)
- [Theme API](#theme-api)
- [Client 模块与 HMR](#client-模块与-hmr)
- [UI 验收](#ui-验收)

官方依据：[Client 模块](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.zh.md)、[Client Slot 注册表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.zh.md)、[Slot Catalog 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts)、[Theme 服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.zh.md)、[Web UI 样式规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)。`master` 只用于导航；Slot、props、Token 和事件名称以目标 commit 的生成 Catalog、公开类型与运行时为准。

## Slot 的本质

Slot 是 Harness 主动留出的 UI 扩展位。插件注册一个 React 组件，宿主决定它何时挂载、传入哪些属性，以及它是新增、替换还是按 key 分发。

不要根据截图猜 Slot。以当前 Harness 的 [`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts) 为准。

Catalog 通常会给出：

- Slot key
- `single`、`list`、`keyed` 或 `chain` 类型
- root、session 或 session-maybe scope
- 注册参数
- 宿主传入的 props
- 已占用 ID/key
- 是否会替换官方 UI

## 常见设置 Slot

| Slot | 用途 | 注意 |
| --- | --- | --- |
| `settings.section` | 新增完整设置页 | 自带导航条目，适合主题编辑器等复杂页面 |
| `settings.general.item` | 通用设置中的单行偏好 | 不是完整页面，组件自己绘制标签和值 |
| `settings.plugin.item` | 插件列表中的一张插件卡 | 不适合作为独立配置页 |
| `settings.plugins.tab` | “插件”设置中的一个页签 | 属于插件设置域 |
| `settings.action` | 设置窗口顶部操作 | 只放短操作 |
| `shell.overlay` | 壳层浮层：自定义检查器、停靠面板 | 不替换对话子树；关闭时清掉自己加的 inset |
| `sidebar` | 整列侧栏 | single 替换会丢掉子槽位，除非你重声明 children |
| `sidebar.footer.action` | 侧栏底部短操作 | 优先于替换整列 sidebar |
| `details` | 官方工具行详情列 | 不要为自定义面板调用 `layout.openDetails` |

如果功能需要预览、多个分组或复杂交互，优先 `settings.section`；只有一个开关时使用 `settings.general.item`。`settings.plugin.item` 是插件清单里的一张卡，不是功能列表。自定义检查器走 `shell.overlay`。调用 `layout.openDetails` 会打开官方空「详情」列。

## 公开 UI 边界

Slot Catalog 公开的是挂载协议，不代表宿主内部 React 组件也可以直接复用。遵循以下边界：

1. 只从目标包公开的 `exports` 导入运行时组件。
2. 不 deep import Harness 源码路径、构建目录或未导出的官方卡片。
3. 优先使用公开 UI primitives、图标和语义 Token 组合界面。
4. 没有公开等价组件时，只实现最小外壳，不复制整份官方私有组件。
5. 自有 CSS 必须以插件根类名或 `data-plugin-*` 隔离；运行时创建的 style/监听由 Cordis 生命周期清理，静态 bundle CSS 则必须保证卸载后也无全局影响。

官方 Web 样式边界还要求：

- Feature 组件使用 CSS Modules 和语义 `--dsw-alias-*` Token，不复制静态色值。
- 共享颜色、字体、阴影、动效和主题分支归主题系统；组件只拥有自身布局或展示所需的局部变量。
- 字号与行高成对设置；已有 typography role 能满足时直接复用。
- hover 或动画不能牺牲键盘焦点可见性与 reduced-motion 行为。

“看起来像官方”依靠公开 primitives、Token、间距和交互状态，而不是依赖私有类名。

公开控件还有产品边界：

- `MarkdownText` 只加载 HTTP(S) 图片。`file:` 或磁盘相对路径不会渲染；本地图要自己起静态服务再改写 URL。
- 内置 `@` mention 芯片按默认短路径序列化。自定义 XML 会被官方芯片样式裁切。
- 用 `padding-left` 等给对话让位时，浮层关闭必须清掉；残留占位是检查器常见回归。

## 注册模式

```ts
ctx.slots.inject("settings.section", () =>
  ctx.slots.register(
    {
      name: "settings.section",
      id: "example-plugin",
      order: 100,
      label: () => ctx.locale.bind(NS)("nav"),
      store,
      locale: NS,
      inject: (actions) => ({
        setValue: actions.setValue,
      }),
    },
    SettingsPage,
  ),
);
```

规则：

1. 始终包在 `ctx.slots.inject(slot, callback)` 中。
2. `name` 必须与目标 Slot 一致。
3. list 型 Slot 的 `id` 必须唯一。
4. keyed 型 Slot 只在宿主派发相同 key 时渲染。
5. single 型或已占用 keyed cell 会发生替换，应先看 `replaceRisk`。
6. 不自行设置内部优先级，除非当前公开 API 明确允许。
7. `slots.register`、`slots.inject` 等 Cordis 注册由当前 fiber 持有，卸载时自动撤销；只有需要提前替换或主动关闭时才额外保存 disposer。
8. 自己创建的外部资源必须放入 `ctx.effect()` 并返回 disposer；没有外部资源时不要套一层空 effect。
9. Slot 或 Settings namespace 暂不可用时渲染 `null` 或明确的不可用状态，不让整个 Client 插件崩溃。

## Store 与组件动作

业务状态放在插件自己的 store 中，组件通过 Slot 绑定后的标准 props 读取。写操作从 `inject` 显式注入，避免组件直接访问全局对象。

一个清晰的数据流是：

```text
设置组件交互
  → 注入动作
  → 校验并生成新设置
  → 更新 store
  → 应用 Theme/Remote 副作用
  → 持久化
```

不要让“表单 state”“当前主题 state”“持久化 state”三份数据互相同步。保留一个规范化设置对象，其他内容从它派生。

设置表单使用一个明确的保存边界。保存失败或 revision 冲突时保留用户草稿；外部配置已经变化时，不用旧草稿静默覆盖新值。

## 本地化

```ts
const NS = "example.plugin";

ctx.effect(
  () => ctx.locale.register(NS, { zh, en }),
  "example-plugin: locale",
);
```

- Namespace 使用插件自有前缀。
- Slot label 用函数读取翻译，以便切换语言后自动更新。
- 中英文 key 保持完全一致。
- 长文案必须测试窄窗口、中文和英文，不只看默认中文。
- SVG 内若包含可见文字，应提供对应语言版本；纯图形图标不需要为语言复制。

## Theme API

先读取目标 commit 的 [Theme 服务说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.zh.md)和 `packages/client/ui-theme/src/client/index.ts`，确认 Token 结构、`overrideTokens` 返回值和事件名称。典型模式：

```ts
const SOURCE = "example-plugin";
let releaseOverride = () => {};

function updateTheme(settings: ThemeSettings) {
  const nextRelease = ctx.theme.overrideTokens(
    SOURCE,
    buildOverrides(settings),
  );

  releaseOverride();
  releaseOverride = nextRelease;
}

ctx.on("theme/change", (snapshot) => {
  // 只同步系统/浅色/深色状态，不覆盖用户自定义值。
});

ctx.effect(() => {
  updateTheme(settings);
  return () => releaseOverride();
}, "example-plugin: theme override");
```

### Token 建模

设置项应是语义值，而不是组件选择器：

- accent / focus
- background / foreground
- surface / elevated surface
- sidebar / input / message
- border / muted text
- radius scale
- UI font / code font / font size

每个 Token 同时考虑 light 和 dark。若用户只编辑当前模式，也要保存两套值，切换模式时不能丢失另一套。

### 不要做的事

- 用 `.some-generated-class` 改官方组件。
- 遍历 DOM 给按钮写内联样式。
- 用 `MutationObserver` 持续寻找新节点。
- 覆盖所有 `[role=tab]`、`button`、`textarea`。
- 直接替换 `<html>` 上 Harness 管理的主题属性。

这些方案短期看见效果，但会破坏插件隔离、卸载恢复和版本兼容。

## Client 模块与 HMR

Web 包通过以下三项进入 boot graph：

1. `dsh.client.platform = "web"`。
2. `exports["./client"]` 指向可读取的构建产物。
3. 可选 `dsh.client.inject` 声明 Client 包级依赖边。

`window.__DSH_BOOT__` 中的 entry ID 等于包名，`rev` 来自 bundle 内容哈希。需要区分两类更新：

- 插件集合或 package metadata 变化：通常重启 Harness 后才重新扫描。
- 已注册 bundle 内容变化：开发 HMR watcher 调用 rebuild，更新 `rev` 并通知浏览器。

因此“文件已经构建”不等于页面一定加载了新插件。验证顺序是：重启 Host → 检查 boot manifest → 请求带新 `rev` 的 Client bundle → 刷新页面 → 检查 Client load report。

## UI 验收

- 设置弹窗与其他页面保持相同内容宽度、留白和滚动方式。
- 颜色选择器、下拉框、输入框不溢出。
- 文案在 100%、125%、150% 缩放下不重叠。
- 浅色、深色、跟随系统都可切换。
- 发送按钮、Tab、状态文字、用户消息等都通过语义 Token 联动。
- 焦点态、禁用态、hover、selected 和错误态有足够对比度。
- 卸载或禁用后恢复到原主题。
