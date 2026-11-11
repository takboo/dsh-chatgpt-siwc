# OpenAI Sign in with ChatGPT 对本地／开源 DSH 模型 Provider 的可行性研究

- 研究日期：2026-11-07（Asia/Shanghai）。本文是当日官方网页快照的分析，不保证预览接口或准入规则长期不变。
- 2026-11-11 的核对及当前判定见 [P0 报告](../evidence/p0-offline-2026-11-11.md#openai-公开契约和准入)。套餐表述保留在各自的日期快照中。
- 范围：OpenAI 官方 SIWC/OAuth/Responses 文档及官方用户帮助页；不重复研究已安装 DSH 的扩展接口、不读取其宿主实现。
- 执行边界：没有登录、授权、安装、调用带凭证 API 或修改项目文件；只访问公开资料并生成本报告。目标文件写前两次检查均不存在，故使用指定名称，未覆盖已有文件。
- 标记：**事实**＝官方资料明确陈述；**推论／建议**＝由事实导出的实现判断；**待实测／确认**＝公开资料不足或尚未用真实凭证验证。所有验收条目都是未来要求，不代表已经通过。

## 一、结论

**有条件可行，且已有正式文档化的 OSS 直连路径；不是复用 Codex 私有凭证或 ChatGPT backend-api 的灰色替代。** 官方让开源／本地应用用动态 OAuth 注册、用户授权的 access token、公开 `https://api.openai.com/v1/responses` 完成符合条件的推理，不需要 client secret 或 partner API key。官方同时给出 curl 和 SDK 示例，因此 **OpenAI 官方 SDK 不是强制依赖**。[S1][S2][S4]

**但不能把它实现成“给现有 OpenAI 兼容 Provider 填一个永不过期 API key”。** 它需要独立的注册身份、账号／工作区关联、稳定 host ID、OAuth/OIDC 验证、旋转刷新锁、撤销和有限能力 Responses 适配；当前模型列表还是 `models[]` 而非通常假定的 `data[]`。[S2][S3][S4][S5]

**分阶段结论（推论）：**

1. 对真正本地运行、用户自管凭证的 OSS DSH Provider，可进入“协议适配设计＋无凭证契约测试”；完成本报告的 P0 验收后，再由用户明确授权做账号实测。[S1][S2][S3][S4][S5][S6]
2. 如现有 DSH 的请求序列化、工具命名空间或流错误语义不能由 Provider 隔离适配，仅靠配置和换 token 不足；宿主能力是否足够由主 agent 的 DSH 接口研究裁决，本文不假定支持。[S4][S5]
3. 收费产品或由服务商远程托管的应用，不能因插件开源就推定自动准入：官方要求走 interest form；自托管 OSS VM 则有专页支持，二者应分开判断。[S1][S7][S10][S11]
4. 套餐资料不同步，不能把“必须 Plus/Pro”硬编码成统一规则，也不能承诺“所有账号所有模型均可用”；以具体账号授权、模型目录、完成推理和精确 eligibility 错误作为运行时裁决，商业准入仍须官方确认。[S4][S6][S9][S10][S14]

### 最高风险清单

| 优先级 | 风险 | 必须采取的控制 |
|---|---|---|
| P0 | 把 `dynamic_agent_client` 当正式 client ID，或 ID token `aud` 用错对象 | 保存回调 issued ID；换 token、刷新、撤销均用它；ID-token `aud` 验证它，不是 host ID／resource／动态入口。[S2][S3] |
| P0 | 只解码 JWT、只验 state、按 email 合并账户 | 验签＋issuer＋issued-client audience＋exp＋nonce；注册键保留 issuer/sub/client ID；验证完成前不替换活动账号。[S2][S3][S12] |
| P0 | 多进程或 laptop/VM 同时刷新同一个旋转 refresh token | 会话级跨进程互斥、读最新凭证、原子写整组字段；转移 VM 后由 VM 独占刷新。[S3][S7] |
| P0 | 有 delta 或 HTTP 200 就报成功，遗漏中途额度失败 | 读到 `response.completed` 才算该次推理成功；`failed`／`incomplete`／断流分开处理，保留已有部分输出但不伪报完成。[S4][S6] |
| P0 | 直接复用通用 Responses body／裸 function 工具 | 固定 SIWC 能力白名单，namespace 或 additional_tools，禁止 tool_search 等不支持能力。[S5] |
| P1 | 把套餐、商业托管、自托管 VM、SDK 和模型列表当普通 API 规则 | 分开记录准入与运行时 entitlement；不用 `data[]` parser；不要强制 SDK；对托管商业场景先获确认。[S1][S4][S7][S9][S14] |

## 二、client、agent name、host 与账号的边界

### 2.1 三个标识不能混用

| 项目 | 官方事实 | 对 Provider 的建议／推论 |
|---|---|---|
| 首次动态注册入口 | 首登 `client_id=dynamic_agent_client`。它不是应保存或用于 token exchange 的 client ID。[S2] | 只在新注册 authorize 请求里使用；禁止把它写入“已授权连接”的正式 client ID 字段。 |
| issued client ID | 新注册回调给出 issued `client_id`，如 `oaiapp_...`；绑定经过认证的用户及注册时选定的工作区。后续同注册复用。[S1][S2] | 注册记录应以 `(issuer, validated sub, issued client_id)` 保持隔离；同 email 甚至同 sub 不等于同工作区注册。 |
| host ID | `ext_agent_host_id` 表示工具实例运行的环境。启动前生成并持久化，同 host 重启／再登录不生成新 host；不同 host 有不同 ID。一个 issued client ID 可供同用户／工作区的多个 host 共用。[S1] | 先定义 DSH 的 host 生命周期：安装、用户配置根或其他明确边界；不能每会话／每进程随机变化，也不宜把安装包内同一 ID 复制到所有机器。具体定义由实现方决定。 |
| app actual name | 首次动态注册的 `agent_name_hint` 必须是应用真实名称，各安装一致；用户可编辑，它只是展示元数据而非身份。再次授权省略。[S2] | 明确此集成代表“DSH 应用”还是独立命名的 OSS 客户端，并与发布方一致；不要伪装 Codex/OpenClaw 名称，不要用用户邮箱或每次随机插件实例名。名称本身不提供可信应用证明。 |

**host ID 格式事实：** 推荐基于公钥的 RFC 9278 JWK thumbprint URI（`urn:ietf:params:oauth:jwk-thumbprint:…`）；也支持生成一次并持久化的 `urn:uuid:<UUIDv4>`、`did:key:<key>`。不能使用其它 DID method；host ID 要不透明，不能是 email/user ID。基于公钥的格式目前仍只是标识，OpenAI 不要求证明持有私钥，因此它不是认证或硬件绑定。[S1]

**账号隔离事实：** 不能用相同 email 合并注册，不能把一个注册的 client ID 与另一注册的 token 混用；新增登录尝试须与当前账号分离，身份验证后才激活。签出／切换不创建新 client，保留账号/client 映射和 host ID。[S2][S3]

**待确认：** 发布时实际 `agent_name_hint` 取什么名字、host 生命周期按安装还是 profile 定义，属于产品／发行边界决策；官方没有 DSH 专用命名规则。公开文档亦未给出通用、稳定的 workspace ID claim；不要把 email 或 sub 当 workspace ID。[S1][S2]

### 2.2 官方 SDK 是否必选

- **事实：** SIWC Models and inference 同时给出直接 curl 和 Python OpenAI SDK 请求；SDK 示例把 OAuth access token 传给 `api_key` 参数，让 SDK 发 Bearer header，且示例设 `max_retries=0`。[S4]
- **推论：** 任意可正确处理 HTTPS、JSON 和 SSE 的客户端均能实现官方 wire contract；`api_key` 是 SDK 参数名，不意味着持有普通 API key，也不替代 OAuth 生命周期。没有证据要求额外安装 Codex app-server 或官方 SDK。
- **建议：** 可以复用现有 HTTP/SSE 栈；若选 SDK，单独测试其版本对 namespace/custom/新响应字段的支持、unknown event 处理和重试语义。不要因为 SDK 支持某字段就认为 SIWC 路由支持。
- **事实：** Codex app-server 只是可选桥接方式；它通过 stdio 接调用者、再 HTTP/SSE 接公开 Responses。使用 env token 时，应用自己刷新，然后重启 app-server 并 resume thread。其 bundled/cached model list 不能当 entitlement 检查。[S5][S15]

## 三、完整授权与 OIDC 安全契约

### 3.1 请求参数与 callback

**事实：** 系统浏览器打开 `https://auth.openai.com/api/accounts/authorize`；每次授权生成新随机 `state`、OIDC `nonce` 和 PKCE verifier，保留它们及精确 redirect URI。必须先启动 loopback listener。[S2]

| 参数／阶段 | 官方要求 |
|---|---|
| 新注册 | `client_id=dynamic_agent_client`、真实且一致的 `agent_name_hint`、当前稳定 `ext_agent_host_id`。[S2] |
| 再授权 | 保存的 issued client ID、稳定 host ID；不带 `agent_name_hint`。可发此账号保留的 ID token 为 `id_token_hint`、验证得到的 email 为 `login_hint`；二者不可来自不同账号。[S2][S3] |
| response type | `code`。[S2] |
| redirect URI | 从初始注册起用 HTTP `127.0.0.1`，如 `http://127.0.0.1:1455/auth/callback`，不能换 `localhost`；后续只可换端口，scheme/host/path 不变；每次 authorize 与换码 URI 必须逐字一致（包含端口）。[S2] |
| identity scopes | `openid profile email`。[S2] |
| plan scopes | `offline_access resource.invoke chatgpt.tokens.use.direct`。[S2] |
| resource | `https://api.openai.com/v1`；authorize、code exchange、refresh 均应按各自文档发送。[S2][S3] |
| PKCE | `code_challenge_method=S256`；challenge 为 verifier 的 SHA-256 经无 padding base64url 编码。[S2] |
| callback success | 新注册含 code、state、issued client ID，可能带 scope。再授权可省 client ID；如果提供却与 pending request 的 issued ID 不同，必须拒绝。[S2] |
| callback denied | 即使 `error=access_denied` 也先验 state；结束该尝试，不换码。[S2] |
| 缺 issued ID | 新注册不完整，不能拿动态入口代替或继续换码。[S2] |

**换码事实：** form-encoded POST 到 `https://auth.openai.com/api/accounts/oauth/token`，字段为 `grant_type=authorization_code`、issued `client_id`、`code`、`code_verifier`、完全相同 `redirect_uri` 与 `resource`，不需要 client secret。换码 `invalid_grant` 时丢弃 code，以本次保留的 issued ID 开始新的授权，而非重放旧 code。[S2]

**返回登录事实：** 普通 issued-ID 再授权没有 `id_token_hint` 时先显示账号选择，再重定向，通常没有工作区选择或 consent；有 hint 时跳过账号选择。hint 可以过期，仅提示原账号，不代表有效会话，不改变注册工作区，也不代替新 token 验证。签出后应清掉 token/hint。[S2][S3]

**建议：** listener 只绑定 `127.0.0.1`；pending transaction 具有短 TTL、一次性消费语义，拒绝缺失／超时／重放 state。端口占用时在固定 path 上换可用端口，记录本次 exact URI；超时、取消和成功均释放 listener。后两项是结合官方一次性事务示例的实现要求，不是已验证的 DSH 行为。[S2][S12]

### 3.2 ID-token 验证：aud 必须是 issued client ID

**事实，必须全部实现：**

1. 使用 OpenAI JWKS 验证签名，不是只 base64 解码 JWT。[S2][S12]
2. `iss` 精确匹配 discovery issuer；当前 production 为 `https://auth.openai.com`。[S12][S13]
3. ID token 的 `aud` 必须匹配**本次绑定的 issued client ID**。不是 `dynamic_agent_client`、不是 `ext_agent_host_id`、不是 `https://api.openai.com/v1`，也不是别的已保存账号的 client ID。[S2]
4. 验证 `exp`、本次保存的 nonce，并使用验证后的非空 `sub` 作为账号身份；再次登录还要确认 verified identity 与选中账号一致后才能替换凭证。[S2][S12]
5. 实际 plan 权限以 **token response 的 granted scopes** 含 `chatgpt.tokens.use.direct` 为准；有效 ID token 或 callback 中的 scope 不足以授权推理。[S2][S6]

**JWT 实现建议及来源：** 网站 guide 明确推荐 maintained OAuth/OIDC/JWT library，其示例要求 `sub/exp/iat`、小量 clock tolerance、缓存 JWKS 并在未知 kid 时更新；示例 ID-token aud 是数组，因此实现不应只接受字符串 aud。当前 discovery 广告签名算法只有 `RS256`，应限制为受信算法而非相信 token 自报算法。[S12][S13]

**特别区分（事实）：** token reference 中 **access token** 的 `aud` 是 resource `https://api.openai.com/v1`，而 **ID token** 的 audience 是 issued client ID。这是不同类型 token 的受众，不能把 access-token 样例用于 ID-token 验证。OpenAI 私有 auth metadata 要当 opaque；host ID 也不能当认证凭证。[S8][S1]

**discovery 文档不完整点（事实＋推论）：** 当前公开 discovery 的 `scopes_supported` 仅列 `openid/profile/email/offline_access`，但 SIWC 专页明确要求 `resource.invoke/chatgpt.tokens.use.direct`。因此不要因为它未列扩展 scope 就自行删掉这些 scope；端点/issuer/JWKS 仍从 discovery 读取，授权 scope 以专门 SIWC 契约为准。[S2][S13]

### 3.3 未获 plan scope 的状态

**事实：** 成功 OAuth 但无 `chatgpt.tokens.use.direct` 时可以保留 identity sign-in，把 plan usage 标为 disabled，禁止推理；提示明确选择启用或另配支持的计费途径。用户显式点击启用后，用保存 issued ID 和完整 scope 集重跑授权。`force_reconsent=true` 只能在 OpenAI 确认已为该 integration 部署后使用；此前支持 OAuth `prompt=consent`。普通再登录不能每次强制 consent；这里 OAuth query `prompt` 与不支持的 Responses body `prompt` 不是同一概念。[S6]

**建议：** UI 状态至少分 `disconnected / authorizing / signed_in_without_plan / ready / needs_reauth / usage_blocked / temporarily_unavailable`，避免把“身份登录成功”当“可用模型 Provider 就绪”。

## 四、凭证、刷新、撤销、多进程与远程 VM

### 4.1 存储与刷新

| 事项 | 官方事实 | 落地建议／待确认 |
|---|---|---|
| 保存内容 | 按 issued ID 与 verified identity 分开存 basic info、issuer/sub、client ID、host ID、ID/access/refresh token、scope、expires 信息、saved_at；保留 ID token 供未来 hint。[S2] | 不把 secret 放到 provider 普通配置、浏览器 storage 或可导出的设置；是否利用 DSH secret 服务由主 agent 研究。 |
| 安全 | 本地或自托管 runtime 的保护存储；文件原子写入、Unix owner-only `0600`；禁入源码、log、analytics、支持会话。含 ID-token hint 的授权 URL 也须脱敏。access/refresh 不放 URL。[S2][S3] | 故障报告不收集完整 credential 文件；日志的 state/verifier/code/token 均脱敏。 |
| refresh grant | token endpoint form POST：`grant_type=refresh_token`、保存的 issued `client_id`、最新 refresh token、`resource=https://api.openai.com/v1`；省略 scope 保留 grant。[S3] | 不用动态入口，不用旧 refresh token 重试到失效。 |
| token rotation | 每次成功返回新 access token 和替换 refresh token；最新 token、expiry、granted scopes、refresh token 一起更新。[S2][S3][S8] | 原子记录增加 revision/generation，避免旧请求覆盖更新结果。 |
| 并发 | 官方明确必须串行化同 session 刷新，防两个进程争用旋转 token。[S3] | 仅进程内 Promise mutex 不够；跨进程锁后重读当前记录，刷新成功后原子提交，其他进程重新读取。 |
| 时限 | access token 1 小时（3600 秒）；refresh token 30 天，每次成功刷新获得新 30 天有效期，连续有效替换无固定次数上限。[S8] | 不承诺永不过期；超长离线、撤销等仍需再登录。`earliest_refresh_at` 是官方 token response 字段，但专页没有解释其调度语义；不要自行猜单位／强制刷新规则，待 SDK/协议实测确认。[S8] |

**多进程安全推论：** 锁粒度应为“共享同一 renewable session/token set”，不只是 host ID；同一个 host 可有多个 client 注册，两个 host 也可能因迁移共享同一 session。刷新与 sign-out/revoke 应协调，清本地 token 前阻止其它 writer；stale refresh 的结果不能把刚签出的账号复活。跨设备文件同步不是安全锁方案。[S3][S7]

### 4.2 签出、撤销与掉线

**事实：** 签出先停止请求，尝试用 discovery 的 `revocation_endpoint` 结束 renewable session：form POST `token=<refresh_token>`、`token_type_hint=refresh_token`、issued `client_id`。当前 discovery endpoint 为 `https://auth.openai.com/api/accounts/oauth/revoke`。空 HTTP 200 是成功，已失效 token 也返回成功。撤销 session 不删除 client 注册。[S3][S13]

**事实：** 网络失败／5xx 时，在仍持有 refresh token 期间退避重试；如果选择完成本地签出但未确认远端撤销，必须清本地 token 并告知“远端撤销未确认”，引导去 ChatGPT Settings Disconnect。不能以普通“已彻底撤销”代替。[S3]

**事实：** OpenAI 当前不向工具主动通知用户在 Settings 断开；由请求或 refresh 确认 disconnect 后停用无效 token、要求重新登录。暂时网络／基础设施故障不能触发凭证清空。refresh 终止错误包括 `invalid_grant`、`invalid_refresh_token`、`token_expired`、`refresh_token_expired`、`refresh_token_invalidated`、`refresh_token_reused`；清不可用 token 后复用保存 issued ID 再授权。`invalid_client` 是配置问题，不应靠反复登录修复。[S6]

**待实测：** 撤销后已有 access token 的即时失效时序、同一 client 下其它独立 session 的具体影响，不在这些页面中承诺；不能把 session revoke 展示成“已删除 client／已撤销所有 host”。[S3][S7]

### 4.3 自托管 VM 与商业托管不是一回事

**事实：** Overview 写“open-source and locally hosted apps”，paid 或 remotely hosted app 需提交 interest form；但专门 Self-hosted VMs 页明确支持用户在远程 VM 上运行 OSS app，流程如下。[S1][S7]

1. VM 在导入凭证前生成并持久化自己的 host ID。
2. 同一 tool/client、同一用户和工作区，在本地完成 OAuth；因为浏览器的 `127.0.0.1` callback 回到浏览器所在电脑，而不是 VM。
3. 通过 SSH 等安全通道转移选定注册的受保护 credential（含 issued client ID、access/refresh 和其它 metadata 如 ID token）。
4. 导入时保留 VM 自己的 host ID，不能被 laptop 的 ID 覆盖。
5. 让 VM 管理后续刷新；下次授权用 VM 自己的 host ID。
6. 该操作是转移已有 credential session；**目前 transferred session 的 host-specific usage attribution 和按 host 撤销 plan access 尚不可用。** [S7]

**推论：** 官方承认“用户自托管 OSS VM”这一例外／明确子场景；不能把它扩展成“服务商可以托管多租户产品并统一接收用户 token”。转移的是 session，不是创建独立 session，laptop 与 VM 不能继续无协调地同时用同一个 refresh token。需要双端独立活动时如何得到独立 session，必须另做官方确认与实测。[S1][S3][S7]

## 五、模型目录与 Responses 专用协议适配

### 5.1 当前模型目录不是普通 data 格式

**事实：** 用与推理相同的所选账号 access token 请求 `GET https://api.openai.com/v1/models`。SIWC 专页给出的响应结构是顶层 `models` 数组，筛 `visibility == "list"`，保留服务器排序，在 UI 显示 `display_name`，请求中使用 `slug`；切换账号后刷新目录。[S4]

**推论／建议：**

- 不能直接假定通用 OpenAI `models.list()` 的 `data[].id` 格式；若 SDK 内置 parser 不兼容，用 raw HTTP／raw response adapter 独立处理此契约，不必为此强加新的 SDK。
- 目录缓存至少按账号注册隔离；切换账号、再授权和权利变化后可失效重取。不把示例里的 `gpt-6.1-sol` 硬编码成所有账号可用默认值。
- API 返回目录是 UI 发现依据，不是永久 entitlement 保证。Codex app-server 文档更明确说明 cached catalog 不是 entitlement check，成功完成的那一轮推理才验证该次模型访问。[S4][S15]
- **待实测：** 当前登录账号实际 JSON、模型 capabilities/schema、过期／缺 scope 时目录错误形状；本研究未携带 token 调用目录。[S4]

### 5.2 HTTP Responses 要求及禁用项

**事实：** 只使用公开 `POST https://api.openai.com/v1/responses`，不得指向 ChatGPT `backend-api`。使用所选账号可用模型，Bearer access token；每次 HTTP 推理必须 `store:false`、`stream:true`；input 必须为包含所需上下文的数组。[S4][S5]

| 类别 | 本路由约束（不是普通 OpenAI API 的完整能力表） |
|---|---|
| 指令 | 使用 `instructions` 或 developer messages；显式 `{type:"message", role:"system"}` 被拒绝。建议统一映射到前两种方式，不利用简化 system 形式是否恰好可用作为依赖。[S5] |
| 会话 | HTTP 省略 `previous_response_id`，每次发送所需 history；也不能传 `conversation`。WebSocket continuation 仅同一 authenticated connection 的响应，不是持久服务端 conversation。[S5] |
| 明确不支持字段 | `background`, `conversation`, `max_output_tokens`, `max_tool_calls`, `metadata`, `moderation`, `multi_agent`, `prompt`, `prompt_cache_retention`, `safety_identifier`, `temperature`, `top_logprobs`, `top_p`, `truncation`, `user`。[S5] |
| function/custom | 必须放入 namespaces，或通过 `additional_tools` input items 提供。不能假设普通顶层裸 `function` 数组照用。[S5] |
| hosted tools | web search 仍受 model/account/workspace policy 限制；image generation、file search、Code Interpreter、native computer use、hosted MCP/connectors、Responses `tool_search` 不支持。[S5] |
| tool_search / programmatic | `tool_search` 即使 execution 是 client 也不支持；顶层 `tools` 不接受 `programmatic_tool_calling`。[S5] |
| 输入 | 所选模型接受时支持 text/image/file；不支持 audio/video input、Files upload API 或 transcription API。不能因“支持 file input”推断可先调用 Files upload。[S5] |

**重要推论：** 必须有 SIWC 专用请求 sanitizer／能力声明；普通 API reference、模型通用能力页或 SDK type 接受一个字段，并不授权该路由使用它。也不能通过 namespace/additional_tools 包装被明确禁止的 hosted tool 来绕过限制。[S5][S16]

**history 建议：** history 由本地编排器维护，包括 assistant 输出、reasoning items（适用时）、tool calls 和 call outputs；不得只保留最后一句自然语言后假定 OpenAI 持久保存。通用 function guide 明确 reasoning model 的工具回合需要回传 reasoning items；具体 encrypted reasoning／include 选项在 SIWC 的可用性要单独契约测试，不从通用参考自动推断。[S5][S16][S17]

### 5.3 namespaced function/custom 与 DSH 本地工具

- **事实：** 通用官方 function guide 给出的 namespace 外壳有 `type:"namespace"`、`name`、`description`、嵌套 `tools`；Response API 参考说明其下可装 function/custom。`additional_tools` 是 input item（`type:"additional_tools"`、`role:"developer"`、`tools`），不是随意加一个顶层参数。[S16][S17]
- **事实：** 通用 API reference 为 function call 提供单独的 `namespace` 字段；不能假设工具调用只靠一个扁平 `name` 还原。function 使用结构化 arguments，custom 使用自由文本输入，不能把 custom string 强转为 JSON function arguments。[S16][S17]
- **推论：** Provider 至少要能双向映射 `(namespace, tool name)` 与本地工具身份，保留 `call_id`、参数／文本输入、并发调用和 call-output 关联。名称含点号并不自动等价于真正的 namespace 外壳。
- **事实：** 官方明确区分本地 shell/MCP/child agent 经 function/custom 调用与被禁止的 hosted MCP/tool_search；Codex app-server 本地工具和子 agent 可以使用支持的 function/custom 路径。[S5]
- **推论：** DSH 本地 MCP、shell、子 agent 可以具备协议可行性，但需要宿主自身执行与权限控制，不能把它们序列化成 OpenAI hosted MCP 或 `multi_agent`。这不代表任意 DSH 的工具实现已兼容。
- **待实测：** namespace/custom 在具体模型上的输出事件与回传形式、strict schema、混合 namespace 与 additional_tools、同名异 namespace 的路由、工具动态增减和长历史。发布前优先采用单一稳定 namespace，先验证无歧义 round trip，再增加复杂能力。

## 六、完成语义、额度失败与重试

### 6.1 流终态不能靠文本猜

**事实：** 只有收到 `response.completed` 才把这次推理当成功，必须读至终态。`response.failed` 可以在流已经输出后携带 `subscription_sharing_usage_limit_exceeded` 或 `subscription_sharing_usage_unavailable`；`response.incomplete`、显式 error、断流都必须与 completed 区别。[S4]

**推论／建议：**

- HTTP 200、首 token、`output_text.done`、工具 arguments.done、SSE EOF 或 `[DONE]` 都不能单独替代 SIWC 要求的 `response.completed`。
- 局部文本可以展示，但要显示失败／中断；不要以成功状态提交 agent 回合或声称完整回答。
- `response.completed` 是一次 Responses 推理成功，不等于整个工具循环或用户任务已完成；带 tool call 的 completed response 后仍需执行工具并继续。本地任务完成判定应由 DSH 自己的完成契约负责。[S4][S16]
- 区分用户主动 cancel、transport interrupted、response.incomplete、服务端 failed；不要把取消后的半截工具 JSON 执行为工具调用。
- 已有输出或工具副作用后自动重放整轮可能重复动作和用量；应禁止无条件隐式重试，支持明确用户恢复／安全重试策略。官方示例 `max_retries=0` 可作为简化起点，但不是文档宣布所有客户端必须永不重试。[S4][S6]

### 6.2 错误分层与动作

**事实：** 保留 HTTP status、原 body shape、error code/param（存在时）和 request ID。流打开前 direct admission 可能是 `{"detail":"..."}` 而非标准 `error`；detail 仅诊断文案，不是稳定 machine code。不能把所有错误按一种结构解析，也不能因失败静默切换其它计费路径。[S6]

| 类别／code | 官方动作 |
|---|---|
| admission 401 | 核对所选身份与 direct permission/scopes，不等同于一律删 token。[S6] |
| admission 403 | policy/permission（包括 serving region）限制；展示限制并验证 integration。[S6] |
| admission 503 | direct route 暂不可用／未启用；保留凭证，临时失败有界退避。[S6] |
| `subscription_sharing_user_not_eligible`（403） | 用户／工作区／policy 不符合资格，不重放同请求，不循环 OAuth。[S6] |
| `subscription_sharing_usage_limit_exceeded`（429） | 暂停新的 plan 请求；主操作为 Manage usage。不能据此认定整个套餐已空或猜 reset time，也可能是 app limit。[S6] |
| `subscription_sharing_usage_unavailable`（503） | 暂时查不到用量，保留凭证，稍后有界退避；不能当作额度用尽。[S6] |
| `subscription_sharing_unsupported_capability`（400） | 看 `error.param`，移除不支持 input/tool/feature/model/service-tier override，不重复同 invalid body。[S6] |
| `subscription_sharing_route_not_supported`（403） | 检查精确 method/endpoint，不因其它客户端支持某 route 就沿用。[S6] |
| `subscription_sharing_invalid_user`（401） | subscriber context 无法验证；保留 request ID 并诊断；确认 revoke 或 terminal refresh error 后再要求登录。[S6] |
| `chatpass_v2_scope_not_authorized` / `chatpass_v2_invalid_authorization_context`（403） | 检查 client/grant 配置，不盲目重试或改计费。[S6] |
| `subscription_sharing_user_unavailable`（503） | 用户／工作区信息暂不可用；保留凭证，有界退避。[S6] |

**用量与钱的边界（事实）：** app 用的是共享计划额度，不增加独立 allowance；Plus 五小时额度与其它 app/private/OSS 共享，Pro 无此五小时限制（不等于无限额度）。用量不足不自动换计费。Help Center 还说明到达 plan limits 后，app 可以在用户明确允许时使用可用 ChatGPT credits；app 自己还可能就订阅、基础设施、服务或高级功能收费。此处不推断 credits 的精细开关或自动购买规则。[S3][S9][S14]

**推论：** Provider 不应把“ChatGPT plan”宣传为“永久免费／不会有额外费用”，也不能静默回退到 DSH 已配置 API key。无需在第一版复制一套可能过期的额度计算；明确显示计费路径并链接 `https://chatgpt.com/settings/usage` 更可靠。[S6][S14]

## 七、OSS/local、paid/hosted 与套餐文档不同步

### 7.1 准入矩阵

| 部署／发行场景 | 官方事实 | 本研究判断 |
|---|---|---|
| OSS 本地，用户直接授权和存凭证 | Overview 针对 OSS/local；quickstart 说 plan usage 对 all open-source partners 和 selected private clients 可用，无 client secret/partner API key。[S1][S10] | **可做工程设计，仍待真实授权／路由验证。** 不以文档可读代替每个用户、地区、模型都获准。 |
| OSS 自托管 VM | 专页明确给出 VM host ID、本地 OAuth、安全转移及 VM 刷新流程。[S7] | **有文档化路径**，需安全迁移和独占刷新；无按 host 精细归因／撤销保证。 |
| 收费客户端／付费功能 | Overview 将 paid app 指向 interest form；用户文档允许已参与 app 自己收费。[S1][S9][S14] | 收费本身不是“一律禁止”，但不等于自动取得商业 SIWC 准入；先确认适用计划及 approval。 |
| 服务商远程托管／多租户 SaaS | Overview 要 remotely hosted apps 填 interest form；website/request-client-id 是 selected commercial partners limited trial。[S1][S11][S12] | **不能套用本地 OSS 动态注册作为已批准商业方案。** 即使插件源码公开也不足以证明该产品托管方式获准。 |
| “本地闭源私有客户端” | quickstart 仅称 selected private clients；overview 叙述含 locally hosted，但没有完整私有客户端准入定义。[S1][S10] | **待官方确认**，不把“local”一词当对所有闭源商业产品的 blanket permission。 |

### 7.2 套餐官方页面的现存差异

| 官方页面（本次读取） | 原文口径 |
|---|---|
| learn.chatgpt SIWC | 支持 app 中 eligible Plus/Pro 可选择使用 plan。[S9] |
| developer quickstart | eligible Plus/Pro；又称 plan usage available to all open-source partners and selected private clients。[S10] |
| Help Center 20001542（页面标记 Updated: 10 days ago；相对时间不是绝对版本号） | 商业 participating apps/sites 的 optional plan use 为 Go/Plus/Pro；supported open-source tools remain available to all ChatGPT users；并重申 eligibility/app plan/account/workspace 条件。[S14] |

**事实与限制：** 这些页面的范围不同，也确实没有同步到同一套餐表；Help Center 的 OSS “all ChatGPT users”不能扩写为“每个免费账号都有同等额度／同等模型”；开发文档的 Plus/Pro 也不应被扩大为所有 OSS 的硬性拒绝条件。[S9][S10][S14]

**推论／发布要求：**

1. UI 不从 plan label/email/私有 JWT metadata 自制资格判定；先让用户授权，再检查 scope、模型目录，并在真实请求中处理精确 eligibility/policy 错误。[S2][S4][S6][S8]
2. 文案写“符合资格的账号／工作区可用；能力和额度由 OpenAI 决定”，把“当前商用准入”和“用户套餐资格”分开。
3. 发布前向 OpenAI 确认 DSH 的发行方式、免费/Go/Plus/Pro/Business/Enterprise/workspace 覆盖及地区政策；本文没有证据承诺 Business/Enterprise/Edu 或任意地区支持。
4. 不承诺任何账号的确切模型、无限时长或固定成本。发布记录绑定当时官方文档日期和实测矩阵。

## 八、可落地的验收要求

以下均为待实现／待执行。P0 是公开可用 Provider 的最低门槛；文档研究完成不等于这些项目已验收。

### A. 不登录即可完成的契约与单元测试（P0）

- [ ] **注册状态机：** 新注册 URL 仅使用动态入口＋actual name；再授权仅用 issued ID、稳定 host ID；没有 issued ID 的新 callback 必须失败；返回不同 client ID 必须失败；失败／取消不影响当前活动账号。[S2]
- [ ] **state/PKCE：** fresh state/nonce/verifier；S256 无 padding challenge；过期、缺失、错误、重复 callback 均失败；错误 callback 也验 state；只消费一次；每次固定 exact redirect URI，端口可变而 path/host 不变。[S2][S12]
- [ ] **OIDC negative fixtures：** 无效签名、错误 issuer、aud 为动态入口／resource／host ID／另一个 issued ID、过期、缺 nonce／错 nonce、空 sub 全部拒绝；正确 issued audience（包括 aud array）才可通过；未知 kid 的 JWKS 更新及算法白名单有测试。[S2][S12][S13]
- [ ] **scope 授权：** ID token 有效但 token response 无 direct scope 时不得发 inference；callback scope 不能覆盖 token response；缺 plan scope 的登录状态与 ready 区分。[S2][S6]
- [ ] **账号隔离：** 同 email、同 sub 不同 issued ID、不同 workspace registration 并列；切换后不串 token、hints、catalog、历史和活动请求。[S2][S3][S4]
- [ ] **协议 snapshot：** 强制 `store:false/stream:true/input[]`，正确 instructions/developer；不发送全部禁用字段和 HTTP previous_response_id；拒绝 unsupported tool/search/upload 请求。[S4][S5]
- [ ] **模型 parser：** fixture 使用 `models[]`、slug/display_name/visibility；过滤 list、保序、账号切换更新；常规 data-only fixture 不得被默认为正常 SIWC catalog。[S4]
- [ ] **工具映射：** namespace function 与 custom 的定义／call／output round trip；同名异 namespace、不完整 args、自由文本、多个 call_id、不认识的事件均可安全处理；无隐式 hosted MCP/tool_search。[S5][S16][S17]
- [ ] **SSE 完成：** delta→completed 成功；delta→failed(429 usage limit)、delta→failed(503 unavailable)、incomplete、error、EOF、网络断流、取消均不伪报成功；arguments.done 不等于整轮成功。[S4][S6]
- [ ] **错误结构：** 覆盖 `detail` admission body、标准 error、流内 failed、未知 code、非 JSON body；保存 status/code/param/request ID，凭证脱敏，不能 fallback 到其它计费。[S6]

### B. 本地并发／故障注入测试（P0）

- [ ] **跨进程刷新：** 两个独立进程共享同 session，同时接近 expiry；mock token endpoint 只接到一个有效 refresh，两进程最后都读最新 replacement；锁内重读而非凭旧快照请求。[S3]
- [ ] **原子性：** refresh 成功后的 access/refresh/expiry/scope 一起替换；故障注入到临时文件、fsync/rename 或实际 secret-store transaction 边界时，不留下部分新旧字段；owner-only 权限保持。[S2][S3]
- [ ] **sign-out race：** 刷新未完成时签出，最终状态不被 stale refresh 复活；停止新请求、协调其它进程；成功 revocation 200 与网络失败明确区分。[S3]
- [ ] **恢复策略：** terminal refresh code 才清不可用 token 并复用 issued ID；5xx/offline 不清；invalid_client 显示配置问题而非无限登录。[S6]
- [ ] **无泄漏：** 文件、导出设置、browser storage、崩溃日志、支持摘要和 authorize URL 全面检查不含 token/verifier/code；ID-token hint URL 也脱敏。[S2][S3]

### C. 以后由用户明确授权的最小实测（P0，当前未做）

- [ ] 一台本地 host 首次授权：真实 actual name、稳定 host ID、收到 issued ID、验证 token；凭证权限与落盘正确；不保存动态入口。
- [ ] 同 host 再授权：复用 issued ID/host ID；id_token_hint 有/无路径；端口变化但 callback path 固定；选错账号不能覆盖原注册。
- [ ] 拉取实际模型 catalog，选择 list 模型；完成一次最小文本 SSE（完整读到 response.completed），再完成一次本地 namespace function 与一次 custom 工具 round trip。
- [ ] 真实刷新及两进程协调；sign out revocation；ChatGPT Settings Disconnect 后下次请求/refresh 的恢复。不为测试故意消耗或抬高额度，不启用 credits/自动购买。
- [ ] 对允许的测试账号记录 Free/Go/Plus/Pro/工作区实际 scope、catalog、终态或 eligibility error；缺哪类账号就明确“未验证”，不以推断填表。
- [ ] 如确需 VM：安全转移后 VM host ID 不变、laptop 不再刷新该 session、VM 成功刷新；明确告知用户尚无 transferred session 的按 host 归因／撤销。

依据分别见 [S2][S3][S4][S6][S7][S14]。这些操作均应另行取得授权；本报告未执行登录、真实推理或用量操作。

### D. UX 验收与对主 agent 的交接

- [ ] **P1，官方 UX：** 使用批准品牌及 `Continue with ChatGPT` 按钮；首次启用 plan 后只展示一次确认；模型选择器／composer 附近显示 `Using ChatGPT plan`；`Manage usage` 打开 ChatGPT usage settings；限额错误以 Manage usage 为主操作；清楚区分 app 自身收费／支持的 app plans 与 ChatGPT plan。[S18]

### E. 发布门槛

**建议的最小实现分层（不代表 DSH 现有接口）：** host identity store → per-registration credential/session manager → OAuth loopback/OIDC service → refresh/revoke coordinator → SIWC catalog adapter → restricted Responses serializer/SSE adapter → provider/UI capability layer。若宿主不能传递 namespace/custom 或失败终态，应明确缺口，不用“普通 OpenAI-compatible”标签掩盖。[S2][S3][S4][S5][S6]

**主 agent 需在宿主研究中回答：** 是否允许 per-registration secret storage、跨进程生命周期管理、授权 UI 与 callback listener、账号切换、SIWC 原始目录解析、namespace/custom 无损映射、拒绝不支持字段、把 stream terminal failures 传回完成判断。本文未检查这些 DSH 能力，也没有修改项目。

**上线前阻断项：** issued-ID aud 验证、跨进程旋转刷新、流中额度失败、namespace/custom round trip 任一不满足即不应标为可用；商业/托管分发未确认不得宣称准入；套餐文案必须保留资格条件。后续官方预览变更应有契约回归测试和版本化兼容记录。

## 九、官方来源与引用说明

下列均为 OpenAI 自有官方站点；[S13] 是公开只读 OIDC discovery。引用指向本次读取的页面，正文各事实紧邻引用；“建议”“推论”“待实测”不冒充官方承诺。正文引用编号均链接到下列具体页面；通用 API 参考只用于 wire schema，不用于扩大 SIWC 专页许可的能力。

- [S1] [ChatGPT plan usage / Overview](https://developers.openai.com/siwc/token-sharing-open-source.md) — OSS/local 范围、paid/remote interest form、client/host、host formats。
- [S2] [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in.md) — dynamic entrypoint、actual name、issued ID、callback、scopes/resource、OIDC audience、安全保存。
- [S3] [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions.md) — account separation、refresh/revocation、跨进程旋转、credential security、shared usage。
- [S4] [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md) — models[] catalog、公开 Responses、curl/SDK、stream completed 与中途用量失败。
- [S5] [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md) — SIWC 专门字段／工具／输入限制、namespace/additional_tools、Codex bridge。
- [S6] [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery.md) — missing scope、reconsent rollout、admission 和 structured errors、disconnection、refresh terminal codes。
- [S7] [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.md) — 本地 OAuth、VM host ID、SSH credential transfer、VM owns refresh、transferred session 限制。
- [S8] [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference.md) — token fields、lifetimes、access-token aud、opaque auth metadata。
- [S9] [Sign in with ChatGPT — user guide](https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md) — Plus/Pro 口径、identity vs plan、app fees、usage/disconnect。
- [S10] [SIWC Quickstart](https://developers.openai.com/siwc/quickstart.md) — commercial limited trial、all OSS partners/selected private clients、Plus/Pro 口径。
- [S11] [Request a client ID](https://developers.openai.com/siwc/request-client-id.md) — selected commercial partners、interest form。
- [S12] [On your website](https://developers.openai.com/siwc/website.md) — discovery、JWT/JWKS 签名验证、一次性 state、PKCE、aud/nonce/issuer/exp；OSS sign-in 页明确说明其签名验证示例亦适用 OSS，但 confidential client 与网站 session 不应原样套到 OSS。
- [S13] [OpenAI production OIDC discovery](https://auth.openai.com/.well-known/openid-configuration) — issuer/authorization/token/JWKS/revocation endpoints、RS256、S256、none auth；扩展 scopes 未列在 scopes_supported。
- [S14] [Using your ChatGPT plan in other apps and sites — Help Center](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites) — 商业 Go/Plus/Pro、supported OSS all users、usage/credits/fees/eligibility、故障排查。
- [S15] [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server.md) — optional bridge、catalog not entitlement、completed turn、renewal restart/resume。
- [S16] [Function calling](https://developers.openai.com/api/docs/guides/function-calling.md) — 通用 namespace/function/custom schema 和工具循环；本路由仍受 S5 更窄限制。
- [S17] [Responses / Create a model response — API reference](https://developers.openai.com/api/reference/resources/responses/methods/create.md) — namespace/function_call/function_call_output/additional_tools 等通用 wire schema；不是 SIWC 能力许可清单。
- [S18] [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines.md) — Continue with ChatGPT、Using ChatGPT plan、Manage usage、first-sign-in confirmation、app plans 必须清楚区分。

**路径纠正记录：** Overview 链出的子页实际位于 `/siwc/token-sharing-open-source/<slug>.md`；直接访问 `/siwc/sign-in.md`、`/siwc/profiles-and-sessions.md` 等不带该段的地址在本次访问为 404。本文只把正确子页作为事实依据。

**证据局限：** 未验证账号实际权限、网络地区、token 的真实形状和刷新／撤销时序；未审查具体发行条款或取得商业准入意见；未审查 DSH 插件/模型 API；未安装 SDK 或运行 Codex。最终可用性必须由无凭证契约测试＋经授权的小规模实测共同证明。

[S1]: https://developers.openai.com/siwc/token-sharing-open-source.md
[S2]: https://developers.openai.com/siwc/token-sharing-open-source/sign-in.md
[S3]: https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions.md
[S4]: https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md
[S5]: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md
[S6]: https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery.md
[S7]: https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.md
[S8]: https://developers.openai.com/siwc/token-sharing-open-source/token-reference.md
[S9]: https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md
[S10]: https://developers.openai.com/siwc/quickstart.md
[S11]: https://developers.openai.com/siwc/request-client-id.md
[S12]: https://developers.openai.com/siwc/website.md
[S13]: https://auth.openai.com/.well-known/openid-configuration
[S14]: https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
[S15]: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server.md
[S16]: https://developers.openai.com/api/docs/guides/function-calling.md
[S17]: https://developers.openai.com/api/reference/resources/responses/methods/create.md
[S18]: https://developers.openai.com/siwc/ui-ux-guidelines.md
