# 实施方案

本文记录 provider 的实现设计。各宿主与候选包的实际验证范围见[实施计划](implementation-plan.md)和[证据索引](evidence/README.md)。

## 1. Seam 与模块职责

```text
DSH agent / title / compaction
  → llm.prepareCall → chatgpt-siwc Adapter（单次 attempt）
      → Grant manager：按账号绑定、串行刷新
      → Request codec：DSH history/tools → SIWC Responses
      → Transport：openai@7.55.0，单次发送
      → Stream codec：OpenAI events → DSH StreamChunk
  ← DSH 会话记录、工具审批/执行、下一步与重试

DSH authorization → SIWC login module → credentials grant
DSH model selector ← Adapter.listModels ← OpenAI models[]
```

外部 interface 使用宿主已存在的 `LlmAdapter`，不再发明第二套聊天 interface。复杂 OAuth、协议转换与流终态封装在插件模块，模块内部可注入时钟、随机源、HTTP、credential store，支持确定性测试。

| 模块 | 职责与接口约束 |
|---|---|
| host entry | 注册自身 adapter、authorization flow 与目录；effect 所有权与 cleanup；不改其他 provider |
| auth | 登录、校验、账号绑定、refresh、logout；模型调用方只获取本次有效 grant，不获得 refresh 细节 |
| codec | 纯转换和严格校验，输入冻结对象不变；未知内容明确失败；工具映射可逆且无碰撞 |
| transport | 一次 Responses HTTP attempt；接收 signal；不决定 Agent 下一步、不执行工具 |
| catalog | 同账号授权下获取模型，解析 slug/display_name/visibility；缓存有界且按身份失效 |
| adapter | 组合上述 implementation，统一流与错误，捕获 prepareCall 快照 |

## 2. 标准 bundle 与公开注册

- P1 的 Host ESM、Client factory、`dsh.bundle.patch`、独立 row、双语展示资源及原创 icon 由同一包提供。本地 Web 与官方 Desktop 使用相同包。插件 bundle 只插入自身 row，隔离 profile 的辅助功能配置由测试层提供。
- provider 与凭据 owner 均为 `chatgpt-siwc`。通过宿主 `credentialKey` 创建合法 key。
- 使用 `llm.registerAdapter`；provider 重名时失败并保留原注册，绝不覆盖现有 openai/openai-codex 路由。
- `authorization.registerFlow` 管理按本地注册 key 的交互。新注册在验证后落盘，再授权提交在 `modifyRecord` 锁内核对 generation。Client 只接收脱敏状态和操作入口。
- `listModels` 与 `resolveModel` 提供目录和路由信息。目录保留 `visibility == "list"` 项及服务器顺序，UI 用 `display_name`、请求用 `slug`。目录变化通过 `llm/models-updated` 发布。后续接入可编辑目录时，先落实 settings namespace 契约。
- 模型发现与 GUI 的公开读取只返回元数据／状态，不返回 OAuth token；特权请求留在 Host。
- 若缺失 hard dependency，插件明确 inactive 或加载失败；不绕过 Service 自行寻找宿主私有文件。
- 插件管理页用 `plugins.bundle.config` 按包名注册设置。账号操作经 owner-only Typert 调用，Client 读取脱敏状态。P2 的 Chromium fixture 覆盖 Continue with ChatGPT、活动账号、首次确认、目录和用量指引。Composer 的 plan 标识在 P4 实机验收中验证。[接口快照](research/dsh-contracts.md#client-公开扩展) · [SIWC UX](https://developers.openai.com/siwc/ui-ux-guidelines.md)

## 3. OAuth 与 grant 生命周期

依据[官方登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in.md)。

1. 每个 `DSH_HOME` 首次生成稳定、不含 PII 的应用 host ID。独立保存注册记录及每个 profile 的活动注册选择。登出保留 host ID，迁移／重装语义需明确。
2. 首登使用跨安装一致的真实 `agent_name_hint` 和入口 `dynamic_agent_client`；再授权用 issued ID，省略 name hint，可按官方要求发送保存的 login hints。每次生成 state、nonce、PKCE S256 verifier/challenge；请求 scopes 为 `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`，resource 为 `https://api.openai.com/v1`。
3. 限 loopback callback，验证预期路径、state、一次性使用、超时、取消；在打开浏览器前绑定监听地址。callback 的 issued client ID 按官方格式接收，与此次授权上下文绑定。
   联机入口默认关闭。macOS 或 Linux Host 收到 `enableLiveOAuth: true` 后使用系统浏览器。Host 把无查询参数的一次性回环地址交给系统启动器，再由回环服务把浏览器重定向到固定的授权端点。浏览器和 Host 在同一系统环境运行。[启用步骤](../test/README.md#p4-交互验收)
4. 按官方协议使用 issued ID 换取 token，以可信 discovery/JWKS 校验 ID token 的签名、issuer、audience、时效、nonce；audience 必须对应 issued ID，不是 dynamic_agent_client。允许的算法和 issuer 固定，不信任回调提供任意 JWKS URL。
5. 校验 token response 的实际 granted scopes（不能信 callback scope）与 API resource；缺少直接推理能力不得将账号显示为 inference-ready。登录身份、可发现模型、可完成推理是三个状态。
6. 持久化版本化 GrantRecord，包括 issued client ID、已验证的 `sub`、实际 scopes、access/refresh/ID token、到期时间及 generation。宿主 ID 独立保存在同一 `DSH_HOME`。登出清理 token，保留最小 account/client 映射，供同一工作区复测。公开状态只返回脱敏标签和状态。[注册复用规范](security.md#真实账号复测)
7. 后续授权与刷新复用绑定 client ID；刷新须在 `modifyRecord` 锁内重读、判断到期、调用和写回新令牌，设置网络超时，避免长时间占锁。
8. 验证 refresh 返回的身份／scope 不跨账号或 workspace；不可确认时停止并要求重新登录。
9. 登出、失败与竞争语义以[安全设计](security.md)为准。flow、socket、timer、HTTP 和 listener 随取消／超时／卸载释放。

## 4. 请求与工具 codec

- endpoint 固定 public `https://api.openai.com/v1/responses`，Bearer 使用本次有效 OAuth access token，`User-Agent` 使用 DSH 的 `attributionHeaders()`。OAuth app/client/host 标识用于官方规定的授权参数。SDK 显式固定 base URL，禁用环境组织／项目默认值和 HTTP 重定向。
- 固定 `store:false`、`stream:true`；HTTP 不使用 `previous_response_id`。发送完整当前 DSH 已选择／压缩的上下文，而不是无限复制整个历史日志。
- 采用字段白名单。明确请求 `temperature`、`maxTokens`、`stop` 等不支持控制时返回稳定 unsupported 错误；不静默忽略。避免自己注入不支持的默认值，主对话与辅助请求兼容是 P0 门槛。
- DSH system 语义转换为受支持的 developer/instructions 表达，保持顺序、作用与更新语义；中途 system/developer 更新不能被随意移到开头或降级成 user 文本。
- 根据已核对宿主的 tool update/history 模式投影当前可见工具；历史移除工具仍需保留历史关联。DSH 本地工具全部装入受支持的 namespace 分组，避免 top-level function/custom 定义；不启用 OpenAI hosted tools。
- 首轮使用稳定的 `dsh` namespace 和 DSH 投影出的当前工具集。历史调用按确定性的名称映射及原始 call ID 回传，旧声明不会随历史调用重新开放。DSH 默认工具投影会移除 developer 工具变更消息，系统提示变更沿 `systemPromptUpdate: 'in-history'` 保留并投影为 developer。
- 离线验收使用 DSH 原生压缩引擎和独立的合成摘要路由。SIWC 主请求接收宿主投影后的检查点和保留历史。DSH 把当前可用的 deferred 工具转为即时声明，已移除的工具只保留历史调用及结果。
- 维护 namespace＋wire name ↔ DSH 工具名的一一映射、call ID 和参数原文。合法编码、长名称、同名、重复 ID、未知 namespace、参数 JSON 错误均有 fixture；未知／越权工具不交给执行层。
- 工具结果映射回对应 call ID。工具调用只有在响应成功结算、参数完整并通过校验后才视作可执行；部分流和失败 attempt 不产生可执行的已完成工具调用。
- MVP 仅 text＋本地函数工具；向宿主声明准确的 text-only 能力，遵守宿主已有图片 placeholder／文件 handle 投影，不承诺图像理解，也不在 codec 再隐藏丢弃内容。若收到超出声明的原始内容则发送前拒绝。后续按 DSH attachment interface 接入，不能直读任意本机路径替代。
- 只对有依据的模型能力公布 reasoning effort／context。DSH 能解析省略容量的目录模型，但同一路由 title／compaction 的强制上限以及缺容量时的路由切换需要按[接口快照](research/dsh-contracts.md#主对话与辅助请求)解决。

## 5. 流终态、replay 与重试

- 每个 OpenAI output item/content index 映射到稳定 DSH block index；支持交错文本与多个 tool calls，不依赖增量恰好按单块到达。
- delta 用于展示，`response.completed` 校验通过后才发成功 finish。`response.failed`、`response.incomplete`、EOF 缺终态、畸形 JSON、取消和超时分别处理。[OpenAI 流事件定义](https://developers.openai.com/api/reference/resources/responses/streaming-events#response.completed)
- 缺失 `Content-Type` 时按 SSE 解码并继续验证事件及终态，显式声明其他媒体类型时拒绝响应。适配器跳过 `response.metadata` 的内容。`response.completed` 的 `response.status` 可省略，若提供则必须为 `completed`。[实测记录](evidence/p4-real-account-2026-11-11.md#responsemetadata-兼容修复和最小推理通过)
- TokenUsage 映射 input/output/cache/reasoning，避免重复加总；缺失用量不伪装为已知零消耗。失败可能已计费；若宿主无法表示未知，则省略 usage 并记录非敏感诊断，不制造虚假精确值。订阅消耗不冒充已知美元价格。
- 需要的 reasoning item／encrypted_content 与 call replay 以有界、版本化 ReplayEnvelope 保存；不存 token、ID token 或 OAuth 响应。恢复时只接受本 adapter 可验证的版本与身份绑定语义；不支持的 replay 明确降级／失败，不悄悄破坏工具关联。
- 首轮回放在同一注册中读取已结算的加密 reasoning、assistant phase 与输出顺序。带加密推理的历史换注册时明确失败，纯文本历史可以继续投影。
- `AbortSignal` 贯穿刷新、目录、推理、迭代和关闭；消费者提前停止也关闭上游。HMR／账号切换不得混入旧 token 或模型快照，卸载不影响其他 provider。
- SDK 使用 `maxRetries:0` 与低层 `responses.create`。Agent loop 使用 DSH 默认有限重试策略，退避、会话日志及下一次 attempt 由 `dsh-llm-retry` 负责。直接 LLM 流保持单次发送。插件只在发送前完成有界的凭据有效化。
- 错误沿 DSH failure 接口返回稳定分类、HTTP 状态、符合格式的 request ID 和安全的 Retry-After。流校验失败保留可用的 HTTP 状态与请求 ID，错误消息使用固定文本或限定的协议字段名。
