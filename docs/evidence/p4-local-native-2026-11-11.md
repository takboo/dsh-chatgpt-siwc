# P4 本机 Web 与 Desktop 验收

2026-11-11（Asia/Shanghai）。用户授权在本机 Web 和官方 Desktop 使用真实 ChatGPT 账号。两个 profile 位于专用 `DSH_HOME`，Desktop 使用独立的 Electron 用户数据目录。Web 的本机入口由官方 CLI 在浏览器中打开。真实浏览器授权由用户操作。

| 输入 | 身份 |
|---|---|
| 首版源码与包 | 源码 `b32180535456f273ff55e17e86f37000cc34c50e`，基于 `2d3f21d95a8b8d42c0b5112f9e4db5831288a86c`。包 SHA-256 `e9eb5d2a6413a20418e526c70764a3f16c9224a721a2a6ea615bc775ceb3114c` |
| 工具 ID 修正版 | 源码 `efff2d39db6dcd30881ae8ca6a4261380941bd23`，包 SHA-256 `77e1e77934f4337e6b70730f6646e46654332a875be1cafb89a740792dc2c1e8` |
| 最终候选 | 实测源码快照 `e359a2d273d8eebc4f8c79821cf71bdd3b15cfd2`。`@local/dsh-chatgpt-siwc@0.0.0`，包 SHA-256 `35034a29ea3d38c4852f7281b20feb48f5645eb391a57ac05a991a49e841840a`。可从仓库提交 `804402ba56edf10857c88c9c7deeac4fac4c3611` 重建原包 |
| 依赖锁 | SHA-256 `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6` |
| 两处安装入口 | 每次 Web 和 Desktop 的安装入口摘要一致。首版 `6930648b7f4cd476a3f01d66fa34f5681e5d25d9b72ec45680609d5b6acc6955`，工具 ID 修正版 `bbfe8a781d70c962372d93dbe09120d555474419225ba1f3fa341d7b870729ea`，最终候选 `33d763bcc0e8e8f715b5ae73675e6c0e22ad331959a8fd414d0a0325ec77deb4` |
| 共享基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3` |
| 本机宿主 | macOS `27.2`（`26B123`），ARM64。官方 Desktop `com.deepseek.dsh` `0.2.2-rc.1`，签名团队 `NAN929V4UM`。Web 用同应用随附 CLI 和本机 Zen。内置 Node `24.21.0` |

## 复跑与配置

- 用 Node `26.8.1`、npm `11.19.0` 从干净快照运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run check:pack`。三个候选均通过各自的 67 项测试及静态和打包检查。四项协议回归、ID 长度断言和保活回归分别在相应修复前复现失败。
- 用最终候选执行 `bash test/p3/run-native.sh <锁定基座 checkout> <tarball>`，在断网的 Linux ARM64、Node `24.22.2` 容器通过 37 项 DSH 原生协议、工具、重试和会话用例。
- 从锁定基座运行 `scripts/run-container.sh all`，三个包均通过 Linux ARM64 固定 Chromium 的离线 Web 加载、设置、卸载及安装准入，`0.2.1-rc.4` 按预期拒绝。最终候选报告 SHA-256 `93b41b1d2584c9abb2efd65c75e812b7e213aebd6752d7db2a023f548608a263`。[合成 Web 探针](../../test/p2/host-probe.mjs)
- 用随附 CLI 的 `dsh plugin --profile web add <tarball>` 和 `dsh plugin --profile desktop add <tarball>` 安装。两个 profile 的 bundle 列表及已装入口摘要一致。Web 用 `dsh --profile web --host 127.0.0.1 --port <port>` 启动。须进入 CLI 自动打开的完整本机入口。单独访问裸端口会触发 Web 本地鉴权。Desktop 从签名应用启动。两个 profile 只在试验配置打开联机授权，停用 LLM 标题和手动压缩命令，四个 preset 的自动压缩设为 `auto: false`。Web 核对了实际合成树，Desktop 保留自身默认的界面配置。
- 本机无凭据 HTTPS 预检返回 OpenAI discovery `200`、模型端点 `401`、Google `302`。未将授权 URL、凭据、原始会话或浏览器截图纳入仓库。

换机复建原包时，在独立 checkout 使用表中的仓库提交及 Node `26.8.1`、npm `11.19.0`，按[构建与打包](../../test/README.md#p1-包骨架)执行。已从该 Git 提交复建并与实测包逐字节比对。文档整理后的 `main` 会把新版 `README.md` 一同打包，另产生包摘要。

## 实机结果

| 验收项 | 结果 | 观察 |
|---|---|---|
| Web R1 与设置入口 | pass | 用户完成真实授权与首次套餐确认。试验 profile 的已验证 grant 含直接推理 scope。界面显示活动状态、套餐状态和 Manage usage，Composer 提供 ChatGPT 模型选择 |
| Web 主对话与 Composer badge | pass | 从 Composer 选 `gpt-6-sol`，显示 Using ChatGPT plan，得到预期短文本。持久回合为 `completed`，用量 7379 输入、12 输出、7391 总计 |
| Web 重启续接 | pass | 重启官方 CLI 后，在同一 Web 会话读回第一轮文本并发送后续问题。模型按历史回复验收标记，持久回合为 `completed`，用量 7508 输入、13 输出、7521 总计 |
| Desktop 主对话与 Composer badge | pass | Desktop 复用与 Web 共用的已授权注册，完成套餐确认并读到 8 个模型。Composer 选 `gpt-6.1-sol` 得到预期短文本，用量 7844 输入、13 输出、7857 总计 |
| Desktop R2 工具闭环 | pass | 在本轮临时工作区的只读会话中，请求一次标记文件写入。文件在审批前不存在。DSH 显示 `workspace-write` 审批，选择 Allow once 后文件内容符合预期，持久记录有一次 `allowed-once` 和一次成功 `tool/result`。同一模型收到结果后回复验收标记。工具请求及后续回复的总用量分别为 8207 和 8297 |
| Desktop 模型切换 | pass | 同一个含工具历史的会话从 `gpt-6.1-sol` 切到 `gpt-6-sol`，在试验辅助路由配置下完成下一条消息，用量 9510。该结果适用于明确关闭自动压缩的 profile |
| Desktop stop | pass | 在真实生成进行中从 Composer 停止。界面显示 Stopped，持久回合为 `aborted` |
| Desktop 重启续接 | pass | 停止后重启隔离 Desktop。原会话、`gpt-6-sol` 选择及工具历史仍在，模型正确回答重启前的文件写入结果。持久回合为 `completed`，用量 9762 输入、24 输出、9786 总计 |
| U1 同账号的多个注册 | pass | 在 Desktop 完成第二次实际浏览器授权。宿主内比较确认两条注册的已验证邮箱相同，client ID 和 subject 各自不同，均具备直接推理 scope。Desktop 激活第二条，Web 仍使用第一条。第二条完成独立会话。含第一条注册的加密 reasoning 的旧会话在第二条下返回 `INVALID_REPLAY` |
| Desktop 登出及远端撤销 | pass | 仅退出 Desktop 的第二条注册。界面报告远端续期授权撤销成功。本地 grant 清除，原注册记录保留，Web 的第一条注册仍连接 |
| Desktop 原注册重登录 | pass | 用户点原注册行的 Sign in again。重新授权使用原 client ID 和宿主 ID，注册数保持两条。Desktop 续接同一会话，按重登录前的对话内容完成真实推理 |
| 修正版 Web 续接 | pass | 两个宿主安装相同修正版后，从官方 CLI 启动的本机 Web 中恢复首版会话，模型按已有历史返回标记。持久回合为 `completed`，总用量 7651 |
| 修正版 Web 模型切换 | pass | 同一 Web 会话从 `gpt-6-sol` 切到 `gpt-6.1-sol`，该模型依据此前对话完成验收标记，持久回合为 `completed`，总用量 8950 |
| 修正版 Desktop R2 | pass | 在隔离目录用真实 ChatGPT 订阅请求写入另一份标记文件。审批前文件不存在，选择「允许一次」后 DSH 写入正确内容。持久会话有一次 `allowed-once`、一次成功 `tool/result` 和完成回复，总用量 8330 和 8418 |
| 修正版 B2 | pass | 实际 Desktop 设置切换中文，插件详情显示中文账号状态、目录与管理用量文案，Composer 模型菜单显示「正在使用 ChatGPT 订阅」。同一候选包先在英文设置和 Composer 显示对应文案 |
| 最终候选 Desktop 工具与 stop | pass | 从原生 OpenAI 工具历史切到真实 ChatGPT，读回准确内容，总用量 10103。再次完成隔离文件写入审批、写入及结果回传，两个推理步骤用量 10454 和 10545。停止后界面显示 Stopped，持久回合为 `aborted` |
| 最终候选 Web 自然刷新 | pass | 2026-11-11 23:42（Asia/Shanghai），在原访问令牌进入到期前 30 秒窗口后，从同一 Web 会话发送消息。宿主内观察访问令牌和刷新令牌均轮转，过期时间延后，generation、client ID 及宿主 ID 一致。没有浏览器重登录。随后 `gpt-6.1-sol` 完成回复，总用量 10333 |
| 最终候选登出与清理 | pass | 对两条试验授权均观察到远端撤销成功和本地 grant 清除。原注册撤销后，Web 原会话下一轮结算为 `AUTH`，没有成功回复。Web 和 Desktop 的试验包已移除，临时宿主及回环对照服务已停止，合成凭据移除。保留试验内已退出的注册映射和宿主 ID，供下次授权复用 |

成功回合的可见用量来自 DSH 持久会话。该层没有观察到真实 provider request ID。P4 结果适用于本文的固定版本和试验配置。默认自动压缩开启时，无 `contextWindow` 的模型切换会触发 DSH `MODEL_SWITCH_COMPACTION_FAILED`。[验收标准](../acceptance.md#宿主与实机mandatory需授权) · [宿主限制](../research/dsh-contracts.md#主对话与辅助请求)

## 问题与处置

| 问题 | 处置和验证 |
|---|---|
| 原 OpenAI 路由的工具 ID 包含 `\|`，首版转换后的 73 字符仍触发真实 HTTP 400 | 最终映射固定为 52 字符，调用和结果配对。原 DSH 历史保留，真实跨路由复跑通过。[跨 provider 回放](#跨-provider-回放) |
| 长回复把 `keepalive` 误作不支持事件并失败 | 跳过保活并继续等待完成终态。真实长流与缺终态回归均已核对。[长回复保活](#长回复保活) |
| 合成回包揭示空完成误报成功、未完成 reasoning 遮蔽失败和用量、上下文溢出未映射、断流丢失安全 HTTP 信息 | 使用 `EMPTY_RESPONSE` 和 `CONTEXT_WINDOW_EXCEEDED`，让明确的失败终态结算未完成 reasoning，保留可用的安全 HTTP 信息。相应回归通过。[修复前探针](../research/responses-protocol-comparison.md#本地观察) · [协议回归](../../test/p3/responses.test.mjs) |
| 直接打开裸 Web 地址会报 `dsh web authentication required` | 从 CLI 打开本次完整本机入口后恢复。通行密钥用本机浏览器完成，Tart 扫码限制保留在历史记录。[Web 启动](../../test/README.md#本机真实账号验收) · [Tart 实测](p4-real-account-2026-11-11.md#tart-扫码复试和本机-web-验证) |
| 默认自动压缩下，目标模型缺少 `contextWindow` 时 DSH 拒绝切换 | 本轮隔离 profile 明确停用标题生成及手动和自动压缩。默认配置支持仍取决于可核实的容量和可用的摘要路由。[宿主限制](../research/dsh-contracts.md#主对话与辅助请求) |
| 切换注册后回放含另一注册的加密 reasoning 返回 `INVALID_REPLAY` | 保留现有注册绑定。继续该历史时选回原注册，另一条注册可在新会话中使用。该边界已在 Desktop 实测。[回放设计](../architecture.md#5-流终态replay-与重试) |

## 跨 provider 回放

隔离 Desktop 同时加载 `openai`、`deepseek-official` 和 `chatgpt-siwc`。前两者用 DSH 自带 adapter，测试 endpoint 指向本机回环合成服务。模型选择器按 provider 分组，DeepSeek 与 ChatGPT 可同时显示名为 GPT-6-Sol 的模型，套餐徽标仅出现在 ChatGPT 路由。

原生 OpenAI 路由产生 `call_id|item_id` 格式的工具 ID，DSH 在临时工作区执行读工具，回环服务收到对应工具结果。首版候选切到真实 ChatGPT 后返回 HTTP 400。最小请求复跑确认上游错误代码 `string_above_max_length` 指向 `call_id`，上限 64，首版映射为 73 字符。修正后用 SHA-256 的 Base64URL 编码生成 52 字符 ID。回归要求调用与结果使用同一个 ID，覆盖复合和超长输入，保留 DSH 历史的原始 ID。

重启 Desktop 装载修正版，接回同一持久会话，用真实 `gpt-6-sol` 正确读回先前的工具结果，结算 `completed`，总用量 9547。该轮没有重新执行工具。随后在同一会话选同名的 `deepseek-official` 模型，回环 Messages 服务响应，结算 `completed`。

在 Desktop 插件管理关闭候选后，ChatGPT 从模型目录退出，原 OpenAI 和 DeepSeek 路由均返回各自标记。关闭状态跨重启保持，OpenAI 仍完成请求。重新启用候选仅用于撤销第二条测试授权，随后从插件详情卸载。Desktop profile 的 bundle 列表移除候选，重启后两个原 provider 均完成回环推理。Web 使用独立 profile，候选和第一条授权在上述步骤期间可用。

## 长回复保活

本机 Web 切换到 `gpt-6.1-sol` 后，长回复在 HTTP 200 的 SSE 中被适配器判为 `INVALID_RESPONSE`。以同一试验注册复跑时，约 39 秒后收到命名为 `keepalive` 的 SSE 事件，数据的 `type` 同为 `keepalive`。脱敏探针只计数事件类型。回归覆盖保活后继续收到文本与 `response.completed`，以及收到保活后缺终态时返回 `TRANSPORT`。

同一真实 Web 注册、模型和合成输入用最终包再次运行本机 DSH 服务探针。约 39.6 秒收到 `keepalive`，约 43.9 秒收到 `response.completed`，流在 2000 个文本 delta 后结算为 `stop`。实际 Web 在同一会话中使用最终包完成后续长回复。
