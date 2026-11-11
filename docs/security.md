# 安全与账号生命周期

状态：P2 用合成授权和实际本地 backing 验证了部分防护。范围见 [P2 证据](evidence/p2-offline-2026-11-11.md)。官方依据见[官方研究](research/openai-siwc.md)，宿主限制见[接口快照](research/dsh-contracts.md)。

## 信任假设

- token 仅存在 Host 内存和宿主 credential store，公开配置仅保存非秘密引用、选择与状态。
- 本地 credential store 使用文件权限与跨进程写锁，**不是 OS keychain／加密保险箱**。同用户进程、具有相应文件权限的 Agent 工具以及恶意同进程 Host 插件仍可能读取。不能宣传“模型工具绝不可能访问 token”。
- 防泄漏主要减少意外暴露；若要求抵御同用户恶意工具，需另外设计权限隔离或外部凭据代理，不在 MVP 声称满足。
- OpenAI 接收实际推理输入；`store:false` 不等于所有日志、风控或保留义务消失，不作零留存承诺。

## 威胁与要求

| 威胁 | 约束／验证 |
|---|---|
| OAuth CSRF／回调替换 | state、PKCE、nonce、可信 issuer/JWKS、issued aud、精确 redirect、单次 callback |
| app 冒名 | 自身应用名和 host ID，禁用其他应用 client ID 或 Origin/User-Agent 伪装 |
| 凭据外泄 | Client、localStorage、设置、模型消息、命令行参数、遥测、异常 cause 不携带秘密 |
| 任意 endpoint 窃取 token | auth/resource/推理 origin 白名单；拒绝跨 origin redirect 携带 Authorization，未验证自定义 baseURL 不开放 |
| 多进程 refresh token 轮转 | 锁内读取－刷新－原子提交；失败不覆盖有效旧记录；含超时、取消与重入测试 |
| 授权变成不可用 | 检查实际 scope、workspace 和 catalog；身份登录不标成推理成功 |
| logout 后刷新复活 | record generation＋锁内检查；记录不存在／已 disabled 时刷新 mutation 不重建 |
| 账号串用 | 所有缓存与 in-flight 操作绑定 issuer/sub/workspace/client/host generation；切换先终止旧调用 |
| 注入未知工具 | namespace/name/call ID 严格对应 DSH 已提供工具；执行仍由 DSH 审批与沙箱负责 |
| 日志漏 token | 对请求头、URL query、OAuth code、token 响应、SDK 原始异常统一脱敏，测试使用唯一 canary |

## 刷新与登出状态机

公开状态建议：signed-out → authorizing → authorized（身份）→ inference-ready；refreshing、reauth-required、not-eligible、error 为可解释分支。额度耗尽不是自动换账号的理由。

- refresh 必须 `modifyRecord` 内重读；令牌轮转写回成功前不把新 token 分发给请求。网络结果含糊而 refresh token 可能已失效时停止盲重试，要求重新授权。
- logout 先使当前 generation 失效并取消调用／登录；与刷新使用同一记录的串行语义，标记 signing-out 阻止新消费和刷新。仍持有 refresh token 时尝试远端撤销，然后原子清 access/refresh/ID token，保留最小 account/client 映射及 signed-out generation。所有异步完成提交前重查 generation；新增登录使用新 generation，旧 writer 不可复活。
- `modifyRecord` 返回 `undefined` 时保留原值，清 token 须提交更新后的 payload。若后续增加「忘记注册」，使用独立的 `deleteRecord` 操作，并在实际 backing 上验证它与登出、刷新并发时的顺序。
- 若刷新交换后写入失败，当前 Host 记住该世代并停止再次消费或轮转，提示重新授权。故障进程的这条标记在内存中，其他进程依赖 backing 中的已提交记录及上游拒绝旧 refresh token。
- 撤销按 [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions.md)：从可信 discovery 获取 revocation_endpoint，以 form POST 发送 refresh token、`token_type_hint=refresh_token`、issued client_id。空 200（含 token 已无效）为成功；网络／5xx 可在 token 仍在且有界的窗口退避。未确认则完成本地清除，并显示“本地已退出，远端撤销未确认”，引导 ChatGPT Settings Disconnect。不可硬猜 endpoint，亦不把本 session revoke 称为删除 client 或撤销全部 host。
- 本地退出不等于所有历史 token 在远端失效；卸载插件也不等于撤销。提供显式登出和孤立 record 清理说明，不能卸载时删除其他 owner 的凭据。
- 每个 `DSH_HOME` 独立保存稳定 host ID。每个 profile 仅激活一个已验证且具备推理权限的注册。切换取消旧账号请求及缓存，其他已保存注册仍可由用户选择。
- DSH `0.2.2-rc.1` 的 `session.commit(record)` 使用固定值写入，进入提交后取消不再撤回。再授权若覆盖已有记录，须用锁内 generation 检查处理 logout 和切换竞争。合成挂载试验只覆盖基本提交。[宿主提交语义](research/dsh-contracts.md#授权提交与账号)
- 联机 Host 通过同一个 IPv4 回环监听器为每次浏览器交接签发一次性随机路径。系统启动器的参数只有该回环地址。首次匹配的 GET 在 Host 内取出授权 URL，发送带 `no-store` 和 `no-referrer` 的重定向。路径随取消、超时、完成或卸载一起失效。授权 URL 和返回页按敏感数据处理，Client 和启动器错误只返回脱敏状态。
- P3 适配器在准备调用时捕获注册与记录世代，在发送前和结算前核对。SDK 关闭日志与自动重试。流失败只返回分类和经检查的 HTTP 事实，工具调用在成功终态整体验证后才交给 DSH。包含加密推理的回放与本地注册绑定。

## 真实账号复测

- 为减少重复动态注册，同一宿主上的复测沿用专用隔离 `DSH_HOME` 和 profile。更新候选包或重启时保留本地注册映射及稳定的 `ext_agent_host_id`。
- 同一 ChatGPT 账号和工作区已有注册时，在原账号行选择「重新登录」（`Sign in again`），复用已签发的 `client_id`。重新授权失败时先排查原注册的错误。仅在没有可复用的注册或用例明确覆盖首次注册时，才使用 `dynamic_agent_client`。[OpenAI 授权流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in#2-start-authorization)
- 每轮结束按上文退出、尝试远端撤销并清除本地 access、refresh 和 ID token。后续复测所需的注册映射和宿主 ID 保留在本机受限试验目录。取证时只报告标识是否复用及撤销结果，遵循[证据规则](evidence/README.md)。[OpenAI 账号与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions#end-the-renewable-session)

## 留存与诊断

允许记录：安全错误类别、状态码、受支持的 request ID、耗时、重试次数、目录大小、宿主／产物身份。账号标识按最小化策略处理，仅必要本地脱敏展示。

禁止提交：真实 token、OAuth code、verifier、原始 callback URL、完整身份声明、credential 文件、未经审查的日志／抓包。仓库忽略规则不是安全控制，所有分发包必须执行 canary 检查。真实证据先脱敏再人工审查；原始材料保留在仓库外。
