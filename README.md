<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="build-deepseek-harness-plugin: install a DeepSeek Harness plugin into a profile and use official slots, remotes, and credentials">
</p>

<p align="center">
  English | <a href="./README.zh.md">中文</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-4D6BFE?style=flat-square"></a>
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-4D6BFE?style=flat-square">
</p>

# build-deepseek-harness-plugin

创建、改造和检查可安装的插件组合包，处理界面扩展、远程调用、设置、凭据及加载验收。

Official first-plugin tutorials stay the source for the first mile. This skill adds the reload, layout, and credential rules that show up after you ship a real bundle.

Read these official pages first:

- [Your first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Build a tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Package and install](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.md)
- [API Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)

The whale mark is the official DeepSeek Harness logo from the [Harness website assets](https://github.com/deepseek-ai/deepseek-harness/blob/master/website/public/favicon.svg).

## What it is for

- Creating or debugging a plugin added with `dsh plugin add`
- Client slots (`settings.plugin.item`, `shell.overlay`, sidebar children)
- Typert remotes, `credentials.set`, and “I changed the schema but the UI is old”
- Replacing an official plugin without borrowing its Cordis id

Not for in-session `cordis_define` packages, browser extensions, or PRs inside `deepseek-ai/deepseek-harness`.

## Install the skill

Ask your Agent to install `https://github.com/oil-oil/build-deepseek-harness-plugin`, or use the skills CLI:

```sh
npx skills add https://github.com/oil-oil/build-deepseek-harness-plugin
```

Claude Code / Codex:

```sh
git clone https://github.com/oil-oil/build-deepseek-harness-plugin.git
ln -s "$(pwd)/build-deepseek-harness-plugin" ~/.claude/skills/build-deepseek-harness-plugin
ln -s "$(pwd)/build-deepseek-harness-plugin" ~/.codex/skills/build-deepseek-harness-plugin
```

Then name `$build-deepseek-harness-plugin` on the next plugin task.

## Usage: how an agent should start

1. Confirm the work is a packaged bundle, not a dynamic Cordis package.
2. Read the official path that matches the task under [docs/user/develop](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/user/develop).
3. Open only the reference that applies:

| Task | Read |
| --- | --- |
| Evidence vs project convention | [references/official-practices.md](./references/official-practices.md) |
| Version breaks and launcher overlays | [references/version-and-integration-boundaries.md](./references/version-and-integration-boundaries.md) |
| Package, patch, five-layer deps | [references/package-and-build.md](./references/package-and-build.md) |
| Slots, theme, widgets | [references/client-slots-and-theme.md](./references/client-slots-and-theme.md) |
| Settings, remotes, credentials, release | [references/persistence-and-release.md](./references/persistence-and-release.md) |

4. After a contract change: rebuild, restart the profile process, hard-refresh the browser.

Check a plugin checkout:

```sh
node scripts/check_plugin.mjs /path/to/plugin --harness-version 0.1.2-rc.1
```

## Configuration

The skill needs no API key or service account. For version-sensitive work, give the agent the target Harness commit, CLI version, profile, and launcher or Desktop version/mode. The bundled reference checker accepts `--harness <checkout> --harness-ref <commit>`.

## Compatibility and security boundaries

- 当前维护基线：Harness `0.1.2-rc.1`（npm latest）；已核对最新 alpha `0.1.5-alpha.1` 的模块表，核对日期 2026-09-09。检查器按具体版本拦截旧 runtime 与缺失 external；alpha 的界面尚未实机验证。
- Independent GitHub packages do not automatically appear on `ctx.remote` just because Host declared `@Remote`.
- The skill reads plugin and Harness source, can run local build/check commands, and only edits or publishes repositories the user placed in scope. It does not require credentials or send project data to a service.
- This is community field notes. If it disagrees with official docs, follow official docs.

## License

[MIT](./LICENSE)

---

Independent community notes. Not affiliated with or endorsed by DeepSeek.
