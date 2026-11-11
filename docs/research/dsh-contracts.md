# DSH 接口事实快照

2026-11-11 核对官方 `dsh-v0.2.2-rc.1` 源码与同版本 npm 服务包。运行结果与依赖身份见 [P0 离线报告](../evidence/p0-offline-2026-11-11.md)。2026-11-07 的初查来自已装 Desktop 的 Host Inspect 和本机文件。当前声明可用性的结论以公开 npm 产物为准。

## Host 接入

| 接口 | 可用契约与 P0 观察 |
|---|---|
| `llm` | `registerAdapter` 绑定路由与 fiber。重复注册抛 `DUPLICATE_ADAPTER`。`prepareCall` 捕获该次注册及模型快照，支持单次 `stream`。fixture 在释放 fiber 后观察到路由撤回。 |
| 目录 | `listModels` 提供 GUI 候选，`resolveModel` 提供精确路由元数据。目录变化可 `emit('llm/models-updated', provider)`。`registerConfigurableProviders` 和 `registerModelDiscovery` 面向配置草稿，按需接入。本项目的已授权目录由 `listModels` 提供。 |
| 请求与流 | `GenerateOptions` 和 `StreamChunk` 可公开导入。请求可能深冻结。用量的 `inputTokens` 排除缓存输入，reasoning 是输出明细。终态可带 `ReplayEnvelope`，随已组装的 assistant 消息持久化。HTTP 归因使用公开的 `attributionHeaders()`。 |
| 元数据 | `LlmModelInfo` 的输入模态、badge 可选。精确解析的 `context` 和 `defaultMaxTokens` 可省略。fixture 中目录与 `prepareCall` 均成功，且后者没有补写输出上限。 |
| `authorization` | `registerFlow` 固定一个 `CredentialKey`，`begin` 按 key 并发互斥并接受一组 prompt／notify，`cancel` 可撤回活动流程。fixture 经 `session.commit` 写合成 grant，再观测目录变化。 |
| `credentials` | 公开 `credentialKey`、`readRecord`、`describeRecord`、`listRecords`、`modifyRecord` 与 `deleteRecord`。本地 backing 文档规定写锁内重读，`modifyRecord` 返回 `undefined` 保留原值。fixture 核对单进程提交、保留语义和新文件的 `0600` 权限。 |

固定来源：[LLM](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm/README.md) · [归因](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm/src/attribution.ts) · [Authorization](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/credentials/authorization/README.md) · [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/credentials/credentials/README.md) · [本地 backing](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/credentials/credentials-local/README.md)。

同版 `dsh-llm`、`dsh-authorization`、`dsh-credentials`、`dsh-credentials-local` 和 `dsh-llm-pi-ai` 的根入口声明都在 npm 包内。fixture 的严格类型检查需要补齐 `dsh-llm` 声明引用的同版 `dsh-package-manifest`。最小插件应复用宿主服务，把 Cordis 和所用 DSH seam 包列为宿主提供的 peer，以首个实测版本决定 engine／peer 范围。具体 profile 仍需核对注入与合成。测试依赖见 [fixture lockfile](../../test/p0/package-lock.json)。

### 授权提交与账号

**事实。** `session.commit(record)` 以固定记录覆盖写锁内读取的当前值。一旦进入 committing，`cancel` 不会中断它。服务也会观察 flow 自己经 credentials seam 完成的写入。请以该版本的 [Authorization 实现](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/credentials/authorization/src/index.ts)为准。

**推论。** 首登可以先分配不含个人信息的本地注册 key，验证后才写入 issued client ID 和账号绑定。复用已保存 key 再授权时，登录、刷新和登出应共享 generation 判定。考虑在 flow 内通过公开 `modifyRecord` 实现锁内检查，提交前再次验证 attempt 和 generation，并验证真正写入与 authorization settlement 一致。普通 `session.commit` 的 fixture 只证明基本挂载。

## 主对话与辅助请求

| 入口 | 该版本的事实 | 对 SIWC 的影响 |
|---|---|---|
| 主对话 | Agent 可以不设置 `maxTokens`，LLM runtime 仅在 adapter 报告 `defaultMaxTokens` 时补上限。显式 controls 与请求一起保留。 | 最小 adapter 可以省略默认上限。显式温度、上限或 stop 应在发送前报 `UNSUPPORTED_OPTION`。实际产品组合、切换和恢复仍需验证。 |
| Title | `session-title-llm` 读取要求提供的 `maxOutputTokens`，作为 `maxTokens` 准备请求，并传 `purpose: 'session-title'`。未指定 provider/model 时复用会话的记录路由。 | SIWC 路由无法兑现该上限。候选是明确配置另一路由或收窄入口范围，需在独立 profile 验证。 |
| Compaction | 默认自动压力路径要求当前路由有 `contextWindow`。一般 pre-step 在缺容量时警告后继续，切换目标无容量则返回 `MODEL_SWITCH_COMPACTION_FAILED`。默认摘要执行器传 `maxTokens` 和 `purpose: 'compaction'`，默认使用会话路由。 | 即使辅助摘要另行配置，目标路由的压力检查仍需要可靠容量。可评估隔离 profile 公开的 `auto: false` 或经官方资料确认的容量与预算。仍需处理手动压缩，任何额外模型路由由用户明确配置。 |

固定来源：[Agent 请求构造](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent-loop/src/agent.ts) · [Title 配置](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/session/session-title-llm/README.md) · [Compaction 配置](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/compaction/compaction-basic/README.md) · [摘要请求构造](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/compaction/compaction-basic/src/summarizer.ts)。

## Client 公开扩展

- `LlmModelInfo.badge` 可显示 plan 标识。`conversation.input.model.label` 提供 provider、model、placement 和 selected，只适合非交互内容。需要相邻可点击链接时，可评估 session-scoped `conversation.input.dock` list seat。 [模型选择器](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-model-selection/README.md) · [Composer Slot 契约](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-conversation/src/client/contract/slots.ts)
- `plugins.bundle.config` 是插件详情的公开 keyed Slot，按包名注册，适合 bundle 级账号设置。`plugins.row.config` 适用于单个 row 的配置。该版本的通用 authorization 包提供 Host 服务，未找到面向任意 flow 的通用 Client 操作。账号操作通过本插件的脱敏 Host 接口接入。 [插件管理页配置契约](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-plugin-manager/README.md#configuration-pages)
- Web 与 Desktop 的插件 profile 都取用 Web 模板的基础 bundle 层。两者可以共用 Host row 和 Client factory，真实安装与界面仍分别验收。 [Web 模板](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/util/official-bundles/src/bundles.ts) · [Desktop profile 初始化](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/apps/desktop/src/project-manager.ts)

## pi-ai 复用边界

已发布的 DSH wrapper 使用 `@earendil-works/pi-ai ^1.3.0`。本轮用 `1.3.0` 的 npm 原包核对。官方源码 lock 另外给该版本打补丁，涉及流式工具 JSON 的增量解析等。P0 结果适用于锁定的 npm 依赖组合。独立 route 的可公开配置无法满足目录、请求和回包语义，详见[差异表](../evidence/p0-offline-2026-11-11.md#pi-ai-对照)。 [公开配置](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm-pi-ai/README.md) · [锁定补丁](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/patches/%40earendil-works__pi-ai%401.3.0.patch)
