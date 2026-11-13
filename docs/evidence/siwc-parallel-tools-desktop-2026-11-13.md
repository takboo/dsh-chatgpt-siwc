# SIWC 并行工具字段 Desktop 复测

2026-11-13（Asia/Shanghai），T1 协议探针。目录查询通过。推理对照为 `not-run`，本次目录中没有符合条件的模型。

| 项目 | 复测环境 |
|---|---|
| 宿主 | 官方签名的 macOS ARM64 Desktop `0.2.2-rc.1`，macOS `27.2`（`26B123`）。使用此前归档的签名应用，归档 SHA-256 `3e1b8ef2900cb5a8991d7cae2063529b9623f63eade011c935543550ce71a0ef` |
| 工程基座 | `5178a049eddcf03778125be1db3ae523621f2fc3` |
| 插件 | 原隔离 Desktop 已安装的 `@local/dsh-chatgpt-siwc@0.0.0`，源码 `738563862313740cc561449730d3dcc95f3affd2`。候选包 SHA-256 `bbe00d79f9273bf5c59452f45836d00aa97aaa27d03bf7f46476064c4c785982`，已安装 Host 入口 SHA-256 `82a51b9faee7ab3ece70b41e88bf6de7f5f0325a01a036393be493a9e1027084` |
| 入口 | 在原隔离 `desktop` profile 临时挂载探针。通过插件设置的 `reload` 续期已有授权，再从 Desktop Host 调用公开 `GET https://api.openai.com/v1/models` 读取原始布尔值 |

本机已安装的 Desktop 升到 `0.2.2-rc.2`，原候选包的设置入口返回 404。有效取证来自临时解包的 `0.2.2-rc.1`，复用原隔离 profile 和账号注册。[签名应用归档](p2-host-2026-11-11.md) · [公开 SIWC 目录](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference#1-list-available-models)

目录返回 HTTP 200，共 10 条。`visibility: list` 有 8 条，`hide` 有 2 条。10 条都明确返回 `supports_parallel_tool_calls: true`，`false`、缺失和非布尔值均为 0。可见模型为 `gpt-6.1-sol`、`gpt-6-astra`、`gpt-6.1-terra`、`gpt-6-sol`、`gpt-6-luna`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`。结果适用于本次账号目录。

推理对照的前置条件是可见模型明确返回 `false`。本轮发出 0 次 `POST /v1/responses`，因此两种请求的接受情况和单次响应工具调用数均无观测值。

脱敏结果 SHA-256 为 `a9b8768d52e9fd5fbd6f7bf93ad63906ed540067e437bf45d4e6a6c6368b9b29`。结束时恢复原 profile 补丁，确认隔离 Desktop 的本地监听已关闭。账号仍为 `connected`，保留可续期授权，注册数仍为一。
