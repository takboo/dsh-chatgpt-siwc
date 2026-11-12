# 默认压缩配置下的模型切换复测

2026-11-12（Asia/Shanghai），通过 L5 的已有会话切换和续聊用例。使用本机 Web 与官方 Desktop `0.2.2-rc.1`，macOS `27.2`（`26B123`），ARM64。两个宿主使用同一隔离 `DSH_HOME` 的独立 profile，Desktop 另用独立 Electron 用户数据目录。

| 输入 | 身份 |
|---|---|
| 候选源码 | 基于 `6e2fe8b7319b1edabcf2e5733d3af0cac3796b80` 的工作树。构建时 `git diff -- src` 的 SHA-256 为 `c632d7801b7b1ccf0b51265118ed6c4becf3400d041c32108b404841fb44f7c0` |
| 候选包 | `@local/dsh-chatgpt-siwc@0.0.0`，SHA-256 `fba90e3a066cb66a64b34a9dea0f42add461cfe86592c1d96378fc0c74733dd3`。两处安装的 Host 入口 SHA-256 均为 `d98bea6d36cde4c21f1e31b7dd4d096aa118ea0578674c1efcb819433ee13009` |
| 依赖与基座 | 锁文件 SHA-256 `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6`。锁定基座 `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3` |
| 构建与离线回归 | Node `26.13.0`、npm `11.20.0`、Cordis `4.1.0`。运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run check:pack`，69 项测试及静态与打包检查通过 |

## 目录取证

用户在本机浏览器重新授权原注册。宿主内确认已签发的 client ID 与 host ID 均复用，注册数仍为一。仅观察 SIWC 授权下的 `GET https://api.openai.com/v1/models`，只记录状态码、字段名与规划相关的非敏感模型元数据。

HTTP 200 返回 10 条，其中 `visibility: list` 有 8 条，全部有正整数 `context_window`。`gpt-6.1-sol`、`gpt-6.1-terra` 为 500,000，其余 6 条为 272,000。8 条的 `max_context_window` 都是 872,000。adapter 将较小的 `context_window` 提供给宿主，缺失或格式无效时保留模型并省略容量。脱敏目录摘要 SHA-256 为 `966d54ce9d13a2d3928456bf114afd03fff100b53a6b5da2857ef4474749f553`。[字段评估](../research/responses-protocol-comparison.md#siwc-模型目录字段) · [官方目录](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference#1-list-available-models)

## 同会话切换

用官方 CLI 安装同一个候选包。两处 profile 仅为本次试验启用 SIWC 登录，并将原 OpenAI 路由的 `gpt-4.1-mini` 指向回环合成服务。Web 合成配置读回确认 `compaction-basic` 的 `auto` 保持默认 `true`，手动压缩和模型标题保持启用。Desktop 的 profile 补丁同样没有覆盖这三处。两边使用 `standard` preset。

用两个宿主各自的本地 DSH 会话接口执行 `session/create`、`session/selectModel`、`session/prompt` 和 `session/events`。第一轮用原 OpenAI 路由记住不同的合成标记，确认回合完成。保留同一个会话 ID，切入真实 ChatGPT，提交只要求回忆标记的第二轮。核对原路由和新路由的持久请求头、两轮结算及最终回复。

| 宿主 | 真实目标 | 结果 |
|---|---|---|
| Web（签名应用随附 CLI） | `gpt-6.1-sol` | 两轮均为 `completed`。ChatGPT 正确回忆标记，第二轮 9,214 tokens |
| 官方 Desktop | `gpt-6-sol` | 两轮均为 `completed`。ChatGPT 正确回忆标记，第二轮 9,647 tokens |

两轮都没有触发压缩。用量来自持久会话，未观察 provider request ID。测试覆盖实际 Web 与 Desktop Host 的会话流程，切换通过会话接口提交。本次未覆盖 GUI 模型菜单、长会话压缩、标题同路由生成或重启恢复。离线回归在修复前报告 `MODEL_SWITCH_COMPACTION_FAILED`，修复后从目录读取容量、保留历史、发送一次推理且无 `max_output_tokens`。[自动回归](../../test/p3/native-projection.test.mjs)

结束时远端撤销确认，本地令牌全部清除，两处 profile 均显示已退出。保留用于复测的注册映射和宿主 ID，关闭隔离宿主及回环服务。
