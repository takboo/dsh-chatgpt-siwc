# P4 真实账号验证

2026-11-11（Asia/Shanghai）。用户授权在独占 Tart 来宾中完成一次测试账号登录、模型目录读取和最小文本推理。使用[隔离联机候选](p4-candidate-2026-11-11.md)，包 SHA-256 为 `0de932fe5491506e31616e090e8fb0564e3bff043138581373a0b90489bbf328`，源码快照为 `056a1ca64234b257cf1dabd82badcf35cadbc333`，依赖锁 SHA-256 为 `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6`。

基座 `v0.1.0-rc.3` 对应 `5178a049eddcf03778125be1db3ae523621f2fc3`。`shared-tart` 从锁定 macOS 基线克隆 `dsh-p4-account-20261111T081340-96887`，使用 ARM64 签名 Desktop `0.2.2-rc.1`、内置 Node `24.21.0`、Chromium `152.0.7977.130` 和来宾 Safari。通过图形管理器安装同一包后，以临时 `DSH_HOME` 启用 OAuth。来宾使用仅宿主网络和限源代理，出站绑定本机 Clash TUN。

| 场景 | 结果 | 观察 |
|---|---|---|
| 账号授权前的宿主准备 | pass | 安装、重启和登录入口通过。插件设置交给用户操作。 |
| Google 登录跳转 | pass | 首次尝试被代理白名单拦截，来宾的无凭据复跑重现 CONNECT `403`，插件显示登录超时。临时代理补齐观察到的 `accounts.google.com`、`ssl.gstatic.com`、`cdn.openai.com` 和 `sentinel.openai.com` 后，Google 探针经 TUN 获得 CONNECT `200`、HTTPS `302`，证书校验通过。 |
| P0／R1 真实账号授权 | blocked | 用户使用 Google SSO 和 Bitwarden passkey，首次尝试未能在来宾完成。来宾未装 Bitwarden 应用，复核时蓝牙处于关闭状态。用户选择手机扫码路线后，交接窗口到期前未收到扫码完成确认，插件未观察到可登出的账号。Google 官方文档要求跨设备通行密钥使用蓝牙。[Google 通行密钥说明](https://support.google.com/accounts/answer/13548313) · [Bitwarden 通行密钥说明](https://bitwarden.com/help/storing-passkeys/) |
| 目录、最小文本推理和远端撤销 | not-run | 授权未完成，模型目录和推理探针未触发。没有推理 request ID 或用量，插件未发起远端撤销。 |

只保留代理域名、脱敏状态和无凭据 HTTP 结果。未采集登录页面截图、回调参数或账号标识。临时代理已关闭，来宾已回收，实验室锁已释放，共享基线仍在。本机 `artifacts/p4-candidate/<候选包 SHA-256>/real-account-first-attempt.log` 的 SHA-256 为 `eadbef074b7b3c5e5df1cb6f3b2a0d0a4d0ebfa8d239f2c94361bd40ceb8b5c8`。

## Tart 扫码复试和本机 Web 验证

复试使用相同候选包。独占 Tart 来宾经 Clash TUN 再次到达 Google（CONNECT `200`、HTTPS `302`、证书验证通过）。用户无法打开来宾蓝牙。系统只报告处于 `Off` 的 `APPLE_VIRTUAL` 控制器，未观察到 USB 或 UART 蓝牙设备。扫码授权停在这台来宾的蓝牙条件，推理未发起。随后关闭代理，回收来宾并释放实验室锁。

用户授权改用本机 Zen 的 Bitwarden。在新建临时 `DSH_HOME` 中，用签名的 DSH `0.2.2-rc.1` 内置 CLI 启动独立 Web profile。官方登录、Google 和模型 API 的宿主路由指向 Clash TUN。显式在 Zen 打开本机 Web 入口后，由用户亲自完成 Google 登录和通行密钥验证。

| 场景 | 结果 | 观察 |
|---|---|---|
| 本机 Web 真实账号授权和目录 | pass | 用户看到插件设置显示 `Active` 和 `Using ChatGPT plan`。经 `ctx.llm.listModels('chatgpt-siwc')` 读取到 8 个可列出的模型。 |
| P0 最小推理 | fail | 经 `ctx.llm.stream` 对目录中的 `gpt-6.1-sol` 发出一次无工具短文本请求。DSH 返回 `finish=error`、`INVALID_RESPONSE`，未得到预期文本，也未观察到 request ID 或用量。没有重试。 |
| 本机 Web 登出和远端撤销 | pass | 用户在插件设置点击 `Sign out`，页面显示 `Signed out and revoked the renewable session.`。随后确认监听已停止，并删除了本轮临时 profile。 |
| Desktop 真实账号、R2 工具闭环及其余 R3 操作 | not-run | 本轮在本机 Web 读取目录和发起最小推理。真实工具审批、停止、刷新、重启续接和重登录仍待验。 |

该轮证据只包含错误分类，无法确定真实失败落在 HTTP 响应类型、SSE 解析或事件校验的哪一处。离线回归覆盖这三个失败路径，验证 DSH 保留 HTTP 状态、符合格式的请求 ID 和固定错误消息。推理通过条件仍为观察到 `response.completed` 后的正常 DSH 结算。[OpenAI 模型和推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md) · [OpenAI 登出与撤销](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions.md)

本机 `artifacts/p4-candidate/<候选包 SHA-256>/real-account-retry.log` 的 SHA-256 为 `d17b032e61e686c908427a48c3a2171f084cee62248c046c5a8cafe9db1d560a`。证据仅记录状态、计数和候选包身份，用户截图未纳入仓库。

## 保留注册的 Web 复测

本机 macOS `27.2`（`26B123`、ARM64），签名 DSH `0.2.2-rc.1` 内置 CLI 和 Node `24.21.0`，Zen 人工交接。使用新的专用隔离 `DSH_HOME`，沿用锁定基座 `5178a049eddcf03778125be1db3ae523621f2fc3`。带诊断的工作树候选基于 `94346fa5e6063d7c77527209ac0b08a1d601e0cf`，包 SHA-256 为 `2a9e302654de55ffde000d9471930190762c9fc0b5a9b8ccd1083e475009369c`，包内 Host 入口 SHA-256 为 `bb51cd92ecf53dd6e6b157cfc9a9fece589049ff5c568ac020f418be9074fb63`。

| 场景 | 结果 | 观察 |
|---|---|---|
| 联机预检 | pass | 授权、模型和 Google 域名的宿主路由指向 Clash TUN。无凭据 HTTPS 探针依次得到 `200`、`401`、`302`，证书校验通过。 |
| 本机 Web 首次登记、授权和目录 | pass | 上一轮临时目录已回收，本轮从空白隔离目录首次登记。用户完成授权，宿主确认存在已签发的 `client_id` 和宿主 ID，DSH 返回 8 个模型。 |
| P0 最小推理 | fail | 对同一目录模型 `gpt-6.1-sol` 发出一次无工具短文本请求。收到 HTTP `200`，`Content-Type` 未通过 SSE 校验，插件在读取流事件前返回 `INVALID_RESPONSE`。无文本增量、request ID 或用量可见，未触发第二次推理。 |
| 无凭据 Responses 对照 | pass | 同一内置 Node 经本机网络向公开 Responses 端点发送无凭据 POST，收到 `401 application/json`，有符合格式的 request ID。该对照核对传输路径。 |
| 登出、撤销与注册保留 | pass | 通过本机 DSH 插件的 owner-only 设置接口退出，返回 `confirmed`。宿主内核对账号为 `signedOut`、令牌字段已清除、客户端 ID 和宿主 ID 与退出前一致。随后关闭 Web 监听，移除临时探针，保留专用隔离 profile。 |
| 使用原注册重新授权 | not-run | 原账号行的「重新登录」留待后续实测。 |

该轮待确认真实请求的媒体类型和响应来源。后续在响应边界按白名单记录媒体类型和诊断头是否存在。[OpenAI 模型和推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md)

本机 `artifacts/p4-candidate/<候选包 SHA-256>/real-account-retained-registration.log` 的 SHA-256 为 `1b63ef7e6a23daaf36df3573a361e19e7ef77c3173df118eb1b4b47098d832c1`。注册标识只在宿主内比对，证据仅保留比对结论。

## 复用注册与缺失 Content-Type 的 SSE

在同一本机隔离 Web profile 中由用户选择原账号的「重新登录」。宿主确认已签发的 `client_id` 和宿主 ID 均与退出前一致。使用同一授权和 `gpt-6.1-sol` 发出两次最小文本请求，每次由 DSH 原生 LLM route 单次发送。

| 场景 | 结果 | 观察 |
|---|---|---|
| 原注册重新授权 | pass | 保留的账号从 `signedOut` 恢复至 `connected`，客户端 ID 和宿主 ID 一致，目录返回 8 个模型。 |
| 首次诊断 | fail | 候选 `2a9e302654de55ffde000d9471930190762c9fc0b5a9b8ccd1083e475009369c` 收到 HTTP `200`。请求含 `stream:true`、`store:false`，响应没有 `Content-Type`，正文以 SSE 字段开头。插件在读取事件前拒绝响应。 |
| 缺失媒体类型修复验证 | pass | 同一 profile 安装候选 `f55b09e5eba8ad691b7cc518e05759c83fc2b67245c93c78fc0d7f4b93d8bedb` 后保留授权，安装后的 Host 入口 SHA-256 为 `4de666f795002f7e33cb6fd3192ca90e3d47f88f8176e0eeed52319934089965`。再次收到 HTTP `200` 和缺失 `Content-Type` 的 SSE，插件已向 DSH 输出文本增量。 |
| 同一请求的流终态 | fail | 流事件校验返回 `INVALID_RESPONSE`，终态和用量仍未验收通过。 |
| 登出、撤销与注册保留 | pass | DSH 返回 `confirmed`，本地令牌清除，客户端 ID 与宿主 ID 保留。两个监听已关闭，临时探针配置已移除。 |

离线回归复现并修复了缺失 `Content-Type` 的合法 SSE 被拒绝的问题。显式声明非 SSE 的响应、无 SSE 事件的 HTML 或 JSON 和缺失完成事件的流仍失败。继续核对流事件时，确认了另一处兼容性问题。官方 `response.completed` 的 `response.status` 可省略，原实现要求它必填。已离线复现并修正，明确冲突的状态仍被拒绝。该轮尚未确定真实响应的剩余校验失败点。[OpenAI 流事件定义](https://developers.openai.com/api/reference/resources/responses/streaming-events#response.completed)

本机 `artifacts/p4-candidate/<修复候选包 SHA-256>/real-account-headerless-sse.log` 的 SHA-256 为 `4edf4fa6e49d1268f962109ac4b9c039e5b88b241e093360fcfa1ef4e0a152a6`。证据仅含结构分类和请求计数。

## response.metadata 兼容修复和最小推理通过

复用同一本机 Web 隔离 profile 和原注册。在同一次重新授权中依次使用终态候选和元数据修正版。每条无工具短文本请求均由 DSH `0.2.2-rc.1` 原生 LLM route 单次发送。

| 场景 | 结果 | 观察 |
|---|---|---|
| 定位剩余校验失败 | pass | 候选 `981f61ec7c83e8b62d01fe2bc5e493542e4213239066f41382819e83f99b9c73` 的两次诊断确认文本增量后有 `response.metadata`，随后是带 `status:completed` 的正常完成事件。旧校验在未知元数据事件处中断。 |
| P0 真实最小文本推理 | pass | 候选 `77b954da3f5730e1e26a741881eed20327e1e40d9af8951045bb67bd6d024fd2` 的安装入口 SHA-256 为 `038291902f6904a09703c533576cc43fc5ab1a478fa26bb35a6c589e84353734`。DSH 读到 8 个模型。`gpt-6.1-sol` 返回预期 `OK`，探针观察到 `response.metadata` 和 `response.completed`，DSH 终态为 `stop`。用量为输入 11、输出 5、总计 16 token，未记录到符合格式的 request ID。 |
| 会话收尾 | pass | DSH 确认远端撤销，本地令牌字段清除，`client_id` 与宿主 ID 保持一致。监听停止，临时诊断配置已移除，专用隔离 profile 保留。 |

回归用例覆盖实际观测到的 SSE 事件顺序，并验证元数据内容不会进入 DSH 输出。63 项测试、lint、类型和打包检查通过。真实工具闭环、会话停止和重启续接、令牌刷新及 Desktop 实机验收仍待执行。

本机 `artifacts/p4-candidate/<修复候选包 SHA-256>/real-account-metadata-sse.log` 的 SHA-256 为 `6b3e9f3edacd65619a00073df7c25ab31eca41abff061e6764ed7edc2ad669b9`。记录保留脱敏事件结构、结果和用量。
