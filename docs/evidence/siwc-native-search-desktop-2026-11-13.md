# ChatGPT 原生搜索提供方 Desktop 验收

2026-11-13（Asia/Shanghai），R4。已通过隔离 Desktop 的搜索提供方选择、真实 DeepSeek 对话调用、原生来源链接和同会话续聊。

| 项目 | 环境 |
|---|---|
| 宿主 | 官方签名 macOS ARM64 Desktop `0.2.2-rc.1`，macOS `27.2`（`26B123`），沿用[应用归档](p2-host-2026-11-11.md)和原隔离 `desktop` profile |
| 基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3` |
| 候选 | `@local/dsh-chatgpt-siwc@0.0.0`，源码基于 `88d85517ec2da1d6ec24717b9a04712d0d8e85c0` 和本轮工作树。包 SHA-256 `99509cee31f01914318472d6ca9c7da542a62d505d2befbb52661dd656b69eea`，已安装 Host 入口 SHA-256 `33476e8f710b1c314c2b4388be42a44418df38db81ccb1f25d81e451aacc7c24`，与构建入口一致 |
| 复跑 | 运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run check:pack`。77 项回归通过。用随附 CLI 的 `plugin --profile desktop add <tarball>` 安装。插件详情启用搜索并选中 ChatGPT，通过 Desktop 原生会话接口选模型、提交与读取事件，在渲染器检查搜索卡片 |

## 选择与凭据

初始 `enableChatGptSearch` 为 `false`，`web.searchProvider` 为 `deepseek-official`。通过插件详情页启用功能并点击「选用 ChatGPT 网页搜索」。DSH 读回 `web.searchProvider: chatgpt-siwc`，`web.fetchProvider` 仍为 `http`。

DeepSeek 账号由用户在原隔离 Desktop 原生登录。对话模型采用 `deepseek-account` 下的 `deepseek-flash`。已有 `DEEPSEEK_API_KEY` 保留在原处，两个 DeepSeek 搜索插件的 `apiKeyEnv` 在验收期间均指向 `credentials/describe` 确认为未配置的隔离引用，配置也无直接搜索 Key。这样可核对 DeepSeek 账号授权是否独立满足搜索。ChatGPT 使用原隔离 profile 中已连接的 SIWC 注册。[DSH DeepSeek 搜索凭据选择](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/web/web-search-deepseek/src/index.ts#L105-L125)

## 结果

| 运行 | 首轮 | 续聊 | 提供方 |
|---|---|---|---|
| ChatGPT 搜索 | 原生 `web_search` 对 RFC 9110 §15.5.5 返回 1 条结构化来源，DeepSeek 正确回答 `404 Not Found` 并复述合成标记 | 同一会话正确回忆 `404` 和标记，工具结果总数仍为 1 | 原生选择为 `chatgpt-siwc`。两轮共有 1 个搜索工具结果，`web/deepseek-search-llm-request` 为 0 |
| DeepSeek 搜索对照 | 仅把原生提供方切回 `deepseek-official`，新会话用同一 DeepSeek 账号模型完成查询，返回 8 条来源 | 对照只发一轮 | 记录 1 次 `web/deepseek-search-llm-request`。对话账号授权本身可让 DeepSeek 原生搜索可用 |

ChatGPT 搜索卡片显示指向 RFC Editor 的原生 HTTPS 来源链接，核对链接可见并触发该链接的点击事件。未采集外部浏览器的页面加载结果。离线回归另外确认原生选择只调用选中的提供方，即使另一个提供方可用，以及搜索失败时没有回退。空终态、流中和终态重复引用、缺终态和失败终态由回归覆盖。真实 SIWC 空终态的原始观测见[协议探针](siwc-hosted-search-desktop-2026-11-13.md#实际结果)。

脱敏会话记录摘要 SHA-256 为 `8e8187539f1ebd093109c57640e976a1eb6238b9ad4aabf8c2c7db81639c5063`，DeepSeek 对照为 `1127133b53b66e5ed05ffa1341aa9aeb728c8de68d479aafcf7e3bd40a2c1c63`，原生来源 DOM 与点击记录分别为 `32cb21697c3b4e170d29f5149bbb01853a7fb356614612576cf7dd0c03dec54a` 和 `68db851fce7f284cdc2e62dc99b96c9af8fcf50fd92bf2d6d8dd506e3cd327b1`。测试后通过插件关闭搜索，核对恢复 DSH 默认提供方。关闭隔离 Desktop，逐字节恢复原 profile 补丁，保留候选包及 ChatGPT 登录。关闭前确认 ChatGPT 为 `connected`。
