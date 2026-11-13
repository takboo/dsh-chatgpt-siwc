# 可行性结论与复用决策

2026-11-12 更新。DSH 公开 Host 接口支持独立 provider 接入。P3 已通过合成推理和隔离宿主验收。本机 Web 和官方 Desktop 已以真实订阅验证模型目录、文本和会话恢复，Desktop 已验证工具审批与回传。[P3 验收](../evidence/p3-acceptance-2026-11-11.md) · [P4 双宿主实测](../evidence/p4-local-native-2026-11-11.md)

## 分层结论

| 层面 | 判定 | 依据／剩余条件 |
|---|---|---|
| 官方公开路径 | 已有文档依据 | [OSS/local SIWC](https://developers.openai.com/siwc/token-sharing-open-source.md)提供动态注册、授权及 public Responses 推理路径 |
| DSH 原生流程 | 隔离 composition 已核对 | 已发布的 `0.2.2-rc.1` 接口可挂载模型、授权和凭据。[宿主快照](dsh-contracts.md) |
| 只改现有 provider 配置 | 当前独立路由不满足 | pi-ai 公开路径发送裸函数及显式 system，拒绝 `models[]`，无法按现有配置满足本项目契约。[抓包结果](../evidence/p0-offline-2026-11-11.md#pi-ai-对照) |
| 专用 Adapter | 维持现有设计 | 同宿主插件通过 `onPayload` 在 pi-ai 上补齐请求转换。当前专用路由保留 DSH 的工具和重试边界。实测 SIWC `call_id` 上限为 64 字符，使用固定长度映射可从原 OpenAI 路由续接工具历史。长 SSE 保活后仍须收到真实完成终态。[Responses 对照及离线探针](responses-protocol-comparison.md) · [跨路由实测](../evidence/p4-local-native-2026-11-11.md#跨-provider-回放) |
| 官方 SDK | Host 固定 `openai@7.55.0` | 官方预览要求 `store:false`、`stream:true`，本地函数可用 namespace 或 `additional_tools` 声明，本项目选择 namespace。合成测试核对固定端点、单次发送和终态，Desktop 实测 namespace 工具结果回传。[官方推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) · [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) · [本机证据](../evidence/p4-local-native-2026-11-11.md#实机结果) |
| 本项目准入 | 选定 OSS／本地路径 | 项目采用 MIT。插件免费，用户在本机 Web 或官方 Desktop 自管账号和凭据。[许可证](../../LICENSE) · [SIWC Overview](https://developers.openai.com/siwc/token-sharing-open-source) |
| 账号／workspace／模型可用 | 已实测一个工作区 | 同一已验证邮箱的两条注册分别可用。本机 Web 和官方 Desktop 已在默认压缩配置下从其他路由切入 `gpt-6.1-sol`、`gpt-6-sol` 并继续同一会话。[默认配置复测](../evidence/default-model-switch-2026-11-12.md) · [P4 本机证据](../evidence/p4-local-native-2026-11-11.md) |
| 发布／多版本支持 | 待验收 | 离线宿主结果限定在固定 DSH 版本。完整宿主支持范围和发布条件见[实施计划](../implementation-plan.md)。[P2 双宿主证据](../evidence/p2-host-2026-11-11.md) |

## 默认压缩配置下的模型切换

- **同类接入。** DSH 的 OpenAI 路由从 pi-ai 模型目录取得容量，adapter 将它返回为 `context.contextWindow`。同样走 ChatGPT 订阅的 `dsh-chatgpt-plan` 优先采用目录中的有效 `context_window`，缺省用 `128000`。这个缺省值是该插件的策略。[DSH pi-ai 配置](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm-pi-ai/README.md#configure-provider-routes) · [DSH 模型解析](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm-pi-ai/src/adapter.ts#L335-L368) · [订阅插件目录实现](https://github.com/WillQvQ/dsh-chatgpt-plan/blob/7d1ce4b0e61fdaa5dca8136fb2f352834ae42b8a/adapter.mjs#L23-L36)
- **离线实测。** 2026-11-12 在 macOS ARM64、Node `26.13.0`、DSH `0.2.2-rc.1`，用提交 `6e2fe8b7319b1edabcf2e5733d3af0cac3796b80` 的临时构建和 [原生 Agent fixture](../../test/p3/native-host.mjs) 复现。从另一条模型路由完成一轮后，保留 `BasicCompaction` 默认配置并切换到 SIWC。基线返回 `MODEL_SWITCH_COMPACTION_FAILED`，SIWC 请求数为零。仅给 `resolveModel()` 增加合成的 `contextWindow: 128000` 后，下一轮完成，恰好发出一次 SIWC 请求，保留旧历史，没有生成摘要或发送 `max_output_tokens`。
- **目录实测与采用。** 一个真实订阅工作区的可见模型全部返回正整数 `context_window`。`gpt-6.1-sol` 为 500,000，`gpt-6-sol` 为 272,000。adapter 采用目录值。公开目录文档尚未承诺此字段，缺失或无效时保留模型，省略容量。[双宿主复测](../evidence/default-model-switch-2026-11-12.md) · [字段评估](responses-protocol-comparison.md#siwc-模型目录字段) · [官方模型目录](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference#1-list-available-models)
- **待实测。** 已通过短会话切换和续聊。达到压缩阈值后的摘要仍依赖兼容的摘要路由。[辅助请求契约](dsh-contracts.md#主对话与辅助请求)

## 推理档位

在隔离 Desktop Host 内直连公开 SIWC，`gpt-6.1-sol` 的 `low`、`medium`、`high`、`xhigh`、`max` 均完成，服务端回显与请求一致。adapter 按每个模型的账号目录与这五个已知请求值取交集，公布给 DSH 原生选择器。提供方默认省略请求的 `reasoning`。逐模型候选包在原隔离 Desktop 的 `gpt-6.1-terra` 上通过五档及提供方默认的六轮续聊，包括同会话从 `high` 切到 `max`。当前工作区的 8 个可见模型均有选项。[Desktop 实测](../evidence/siwc-reasoning-desktop-2026-11-12.md)

## 提示缓存

- 2026-11-12 的目录样本中，54 个模型字段没有提示缓存字段。DSH 从每轮 Responses 用量的 `cached_tokens` 统计缓存读取。adapter 将普通输入、缓存读取和写入分别传给 DSH，界面显示全会话缓存读取占输入的比例。用固定 DSH `0.2.2-rc.1` 离线注入 4,000 个输入 token，对照 0 和 3,000 个缓存读取，原生 `tokenUsage` 投影分别得到 0 和 3,000。[用量转换](../../src/host/responses-stream.ts) · [DSH 会话统计](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-chat/src/client/chat/StatsPills.tsx#L101-L120)
- 已留存的两轮 Desktop 选档验收缓存读取和写入均为 0。通用 Responses 的缓存命中要求精确匹配前缀，改动顶层推理档位可能改写前缀。随后在同一个隔离 Desktop 固定 `gpt-6.1-sol` 和 `low`，两次发送完全相同的 3,775 token 输入，再回放历史并追加一条消息。三次原始 SIWC 回包的 `cached_tokens` 和 `cache_write_tokens` 都是 0。原生会话的固定档位两轮对话完成，界面也显示 `Cache hit 0%`。[Desktop 缓存复测](../evidence/siwc-prompt-cache-desktop-2026-11-12.md) · [OpenAI 缓存指南](https://developers.openai.com/api/docs/guides/prompt-caching#change-reasoning-effort-without-rewriting-the-prefix)
- SIWC 预览文档明确排除 `prompt_cache_retention`。pi-ai 的公开 SIWC 路径省略 `prompt_cache_options`，可用会话 ID 作为 `prompt_cache_key`。在本工作区用 `gpt-6.1-sol`、固定 `low` 档的实测中，SIWC 接受带固定 `prompt_cache_key` 的请求，两次缓存读取和写入仍均为 0，回包键值与传入值不同。单独发送 `prompt_cache_options` 的 `mode: implicit` 和 `ttl: 30m` 均返回 HTTP 400 并指向该字段。adapter 的请求体继续采用服务端缓存默认值。[Desktop 参数对照](../evidence/siwc-prompt-cache-desktop-2026-11-12.md#缓存参数对照) · [SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) · [pi-ai 请求构造](https://github.com/earendil-works/pi/blob/v1.3.0/packages/ai/src/api/openai-responses.ts#L355-L365)
- 2026-11-12 核对开源实现。Codex 将有效缓存键写入 `session-id` HTTP 头。OpenCode 的公开 ChatGPT 订阅路由向 `api.openai.com/v1` 发送稳定的 `session-id`。`siwc-proxy` 在同一公开端点将 `session-id` 和请求体 `prompt_cache_key` 设为同值，作者公布的 `gpt-6.1-sol` 样例有 3,611 个输入 token，其中 3,456 个命中。该数字是第三方实测记录。[Codex 变更](https://github.com/openai/codex/commit/bc5957eac9e89e66f990ed490d11e625a4a3b02c) · [OpenCode 订阅路由](https://github.com/anomalyco/opencode/blob/101776024cc69bafb3f9dc90027ab4d1eab40a2a/packages/core/src/plugin/provider/chatgpt.ts#L277-L305) · [siwc-proxy 出站实现](https://github.com/d-nyamkhuu/siwc-proxy/blob/2e8b8afdf03971a32de6e2bd6f7b6bb8c94002b8/siwc_proxy/server.py#L263-L278) · [siwc-proxy 实测记录](https://github.com/d-nyamkhuu/siwc-proxy/blob/2e8b8afdf03971a32de6e2bd6f7b6bb8c94002b8/docs/proxy.md#prompt-caching)
- 同宿主的 `ckanner/dsh-plugin-chatgpt` 以授权和会话范围派生稳定键，同时发请求体 `prompt_cache_key` 和下划线形式的 `session_id`。其回环测试验证请求前缀、请求头和回放稳定性，命中数来自合成回包。[同宿主传输](https://github.com/ckanner/dsh-plugin-chatgpt/blob/2138cb9cba1598b3617826f04ac1ebdf8974bc99/src/api/client.ts#L74-L84) · [同宿主回环测试](https://github.com/ckanner/dsh-plugin-chatgpt/blob/2138cb9cba1598b3617826f04ac1ebdf8974bc99/tests/cache-roundtrip.spec.ts#L20-L38)
- 原隔离 Desktop 的公开 SIWC 对照固定 `gpt-6.1-sol`、`low` 和相同的 3,776 token 请求。仅改变连字符 `session-id` 头，固定组命中 4/6，省略组命中 1/6，逐次换值组命中 0/6。每次命中读取 3,584 个 token，所有请求报告的缓存写入均为 0。[Desktop 请求头对照](../evidence/siwc-prompt-cache-desktop-2026-11-12.md#session-id-请求头对照)
- adapter 采用现有授权注册指纹与 DSH `GenerateOptions.sessionId` 派生稳定请求头。原生 Desktop 以候选包完成 6 轮正常对话，5 轮续聊有 4 轮命中，会话总输入的 65.6% 由缓存读取。该数字适用于本次工作区、模型和会话。[候选包多轮验收](../evidence/siwc-prompt-cache-desktop-2026-11-12.md#adapter-候选包的原生多轮验收) · [DSH 请求构造](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent-loop/src/agent.ts#L729-L745)

## 图片输入

图片输入在 adapter 内复用 DSH 原生附件服务，按目录声明能力并将附件引用转换为 SIWC `input_image`。隔离 Desktop 上的 `gpt-6.1-sol` 通过真实账号首轮识图和同会话图片回放。[Desktop 图片复测](../evidence/siwc-image-desktop-2026-11-12.md)

## 并行工具目录

2026-11-13 的 Desktop 复测中，8 个可见模型和 2 个隐藏条目均明确声明 `supports_parallel_tool_calls: true`。本轮保留现有请求行为，推理对照未触发。[Desktop 目录复测](../evidence/siwc-parallel-tools-desktop-2026-11-13.md) · [开源实现对照](responses-protocol-comparison.md#并行工具字段的开源实现)

## 多图计量与压缩

2026-11-13 的多图复测中，四张大图实际增加 11,060 输入 token，DSH 估算为 222。同会话在下一轮采用实际用量。离线在默认阈值附近确认，无用量锚点时低估会推迟压缩。本轮沿用 DSH 通用计量与默认压缩配置。[多图复测](../evidence/siwc-image-tokens-desktop-2026-11-13.md) · [计量研究](siwc-image-token-estimation.md)

锁定版 DSH 的 `priceImages` 入参仅有图片块，宿主在收集计量输入时没有传递所属消息角色。逐角色估算需要原生接口补齐角色。当前附件序列化已经按角色处理，影响集中在缺少用量锚点时的压缩判定，以及工具结果内联预算。[计量接口与影响](siwc-image-token-estimation.md#实现门槛与范围)

2026-11-13 的源码对照显示，Pi、Codex 和 OpenCode 都用服务端用量与本地估算结合判断上下文压力。OpenCode 在保留用户消息和工具结果结构的阶段把移除的图片转成文字。DSH 原生 DeepSeek adapter 走同一个图片计量接口，用户和工具的保留图片都实际发送，因此两者可以共用图片估算。[开源实现对照](siwc-image-token-estimation.md#开源实现对照)

## 剩余目录字段

2026-11-13 复核脱敏样本的 54 个字段。接入摘要参数后共采用 7 个字段。adapter 按所选模型的 `supports_reasoning_summary_parameter` 请求 `concise`，并借鉴同宿主实现处理摘要增量和终态。隔离 Desktop 上的 `gpt-6.1-sol` 在 `high` 和提供方默认下均先显示摘要，再显示正文。终态保持推理行数量，两组都通过同会话续聊。后续字段继续先核对同宿主和同路由开源实现。[Desktop 候选验收](../evidence/siwc-reasoning-summary-desktop-2026-11-13.md#流式摘要候选包验收) · [开源对照](responses-protocol-comparison.md#推理摘要的开源实现) · [其他字段](responses-protocol-comparison.md#图片接入后的剩余字段)

## 选择与取舍

1. 使用自身真实应用名称和稳定 host ID，走 dynamic registration；不借用 Codex、Hermes 或其他应用身份。
2. 首选专用 `chatgpt-siwc` provider。保留 DSH 的上下文、持久会话、工具执行、审批、沙箱和单次 attempt 重试契约。
3. 最小实现优先选经 P0 核对的官方 SDK 作为 Host 内部传输。保持低层调用与每 attempt 单次发送，在插件内限制请求字段，按 `response.completed` 判定成功。
4. 批准最小实现时复核该 SDK 版本及维护状态。变更版本或改用直接 HTTP/SSE 时复跑相同协议用例。
5. 系统浏览器交接复用 DSH 同版的 `@deepseek-ai/dsh-subprocess` 清理子进程环境。联机入口由隔离 profile 显式开启。[包清单](../../package.json) · [交接验证](../evidence/p4-candidate-2026-11-11.md)

## 验收入口

设计进入条件、最小账号验证和剩余工作由[实施计划](../implementation-plan.md)维护。主对话、辅助路由、会话恢复、账号生命周期和发布通过条件由[验收标准](../acceptance.md)维护。

## 范围

MVP 为本地 Web 和官方 Desktop、多个可保存注册与每个 profile 一个活动账号／workspace、文本和本地函数工具、流式推理、明确登出。其他宿主载体另行验证。

不包含：浏览器凭据、账号池／额度轮转、付费远程托管、共享 token、自建 OAuth 中转、backend-api 回退、读取其他应用的登录缓存、OpenAI hosted tools。自托管 VM 有官方专门流程，但不属于首版自动迁移功能。

## 研究边界

官方公开依据见[研究快照](openai-siwc.md)和 [P0 核对](../evidence/p0-offline-2026-11-11.md#openai-公开契约和准入)。本地凭据文件可被同 OS 用户或同进程插件读取。详见[安全设计](../security.md)。
