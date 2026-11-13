# ChatGPT 订阅界面 Web 复测

2026-11-13（Asia/Shanghai）。用户确认设计预览后，授权在原隔离 Web profile 更新插件并复用已登录账号。

| 项目 | 实测环境 |
|---|---|
| 本机宿主 | 官方签名应用随附 CLI，DSH `0.2.2-rc.1`，macOS ARM64 `27.2`（`26B123`）。内置浏览器访问回环 Web |
| 共享基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3` |
| 候选 | `@local/dsh-chatgpt-siwc@0.0.0`，基于 `a94e308fecc7` 和本轮工作树。tarball SHA-256 `bc62a4c6ad30405592df75e6f404f1d0b1382737a0da1e693f02b4f5c7293204`，lockfile SHA-256 `253fd0b78adbadcb4700d25c1e8a7cd01423ae48ef9045968066c6700c10d992` |
| 安装 | 官方 CLI 的 `dsh plugin --profile web add <tarball>`。已安装 Client SHA-256 `d296a1d0f42c9bcd98cb810fa302ee376c2dece8df145d3ae5d69bfa3238f197`，与构建产物一致。重启原 Web profile，保持原回环端口 |
| 回归 | `npm run lint`、`npm run typecheck`、`npm test`（77 项）、`npm run check:pack`。按[固定 Chromium 入口](../../test/README.md#p2-离线账号和界面)运行独立合成 UI 回归，镜像摘要 `sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a` |

| 验收项 | 结果 |
|---|---|
| U1 · 账号区 | 通过。重启后原账号仍为当前账号，菜单显示与更新前相同的本地注册 ID。可见黑白服务图标、首字头像和添加账号按钮，普通账号行无额度占位 |
| U1 · 搜索说明 | 通过。Web 点击标题旁的 ⓘ 显示说明，Escape 关闭。固定 Chromium 合成回归另核对了悬停和点击后保持显示 |
| R4 · 搜索设置 | 通过。Web 开启搜索、选为提供方、恢复默认，再关闭开关。仅复测设置交互，实际搜索请求与来源回放见[原生搜索 Desktop 验收](siwc-native-search-desktop-2026-11-13.md) |
| U1 · 模型菜单和用量 | 通过。原生菜单有单个「GPT 订阅」分组，模型行无重复徽标。选中 ChatGPT 时输入框显示官方用量入口，切回 DeepSeek 账号模型后隐藏。核对链接目标为 `https://chatgpt.com/settings/usage` |
| L5 · 真实推理 | 通过。在独立测试会话选中 `gpt-6.1-sol`，发送无工具测试提示，收到精确标记 `SIWC-WEB-UI-OK` |

测试结束后保留原登录，搜索恢复为关闭，已有会话恢复到原模型。未执行新增账号、退出或撤销，未复测 Desktop。此轮黑白图标用于本地候选验收，发布时另行核对使用范围。[SIWC 界面指南](https://developers.openai.com/siwc/ui-ux-guidelines) · [OpenAI 品牌指南](https://openai.com/brand/)
