# SIWC 推理摘要 Desktop 对照

2026-11-13（Asia/Shanghai）。W1、W2、W4、W6 协议探针。公开 SIWC 接受 `concise` 和 `auto`，两者在首轮返回了可读摘要。省略摘要的对照组也能正常续聊。全部七次计入对照的请求均为 HTTP 200、`response.completed`。

使用原隔离 Desktop profile 和已有 SIWC 注册。官方签名 macOS ARM64 Desktop 为 `0.2.2-rc.1`，macOS 为 `27.2`（`26B123`），基座锁为 `5178a049eddcf03778125be1db3ae523621f2fc3`。项目 HEAD 为 `87b5b40e9173e9474ed260c36a5037e04a9ed577`，工作树有研究文档修改。原安装包沿用图片验收版本，包 SHA-256 为 `bbe00d79f9273bf5c59452f45836d00aa97aaa27d03bf7f46476064c4c785982`，实测前后核对 Host 入口 SHA-256 为 `82a51b9faee7ab3ece70b41e88bf6de7f5f0325a01a036393be493a9e1027084`。[候选包记录](siwc-image-desktop-2026-11-12.md)

## 目录

Desktop 宿主内的临时探针使用原授权调用公开 `GET /v1/models`，返回 HTTP 200。8 个可见模型和 2 个隐藏条目均明确返回 `supports_reasoning_summary_parameter: true`、`supports_reasoning_summaries: true` 和 `default_reasoning_summary: "none"`。选择可见且已验证 `high` 档的 `gpt-6.1-sol`。推理只覆盖这一款模型。[官方目录](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference#1-list-available-models)

## 请求与续聊

探针从同一 Desktop 宿主直接请求公开 `POST /v1/responses`，固定模型、`high`、合成算术题、`store: false`、`stream: true` 和 `include: ["reasoning.encrypted_content"]`。三组只改摘要参数。每组独立使用一个会话标识，两轮共用该 `session-id`。第二轮按 SIWC HTTP 契约带首轮完整输入、返回的 assistant 消息和加密 reasoning item，要求对上一轮答案做固定运算。两轮的期望答案均事先计算，验证完成和答案正确。探针在 adapter 之外运行，记录上游事件及当前解析规则能读取的摘要长度。[SIWC HTTP 契约](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations#responses-api-requirements) · [当前终态投影](../../src/host/responses-stream.ts#L126-L132)

| 请求 | 首轮终态摘要字符 | 续聊终态摘要字符 | 首轮及续聊 |
|---|---:|---:|---|
| `high`，省略摘要 | 0 | 0 | 两轮完成，答案正确 |
| `high` + `concise` | 53 | 0 | 两轮完成，答案正确 |
| `high` + `auto` | 28 | 23 | 两轮完成，答案正确 |
| 提供方默认，仅传 `summary: "concise"` | 43 | — | 首轮完成，答案正确，终态回报 `effort: "medium"` |

有可读摘要的四次请求都先在 `response.reasoning_summary_text.delta` 返回文字，随后在 `response.reasoning_summary_text.done`、`response.reasoning_summary_part.done`、`response.output_item.done` 和 `response.completed` 中都有非空文字。每次有摘要的终态均包含一段摘要，`output_item.done` 的摘要长度与最终响应一致。七次终态都包含一个带加密内容的 reasoning item，三次续聊均实际回传了对应首轮的一个加密 item。两次 `auto` 的终态均回报 `summary: "detailed"`。只传 `concise` 的补测请求体省略 `effort`，终态回报由服务端选择的 `medium`。每组一次首轮和一次续聊，摘要长度与出现频率仅适用于这批请求。[官方摘要参数](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries)

首次探针把缺少 `Content-Type` 的 HTTP 200 当作本地解析失败。修正探针后重跑，七次响应均缺该响应头并提供可解析的 SSE 终态。最终记录只包含修正后的完整对照。当前 adapter 已有缺头时按 SSE 校验的路径，且这批摘要都出现在它能读取的终态中。交互式推理行、仅增量摘要的真实回包和提供方默认的第二轮未在本次覆盖。[当前传输处理](../../src/host/responses.ts#L102-L110)

结束时原账号仍为 `connected`，账号、注册与授权 generation 均复用，保留可续期授权。隔离 Desktop 已关闭，临时探针配置已恢复。探针通过临时 Cordis 插件运行，脱敏 JSON 留在仓库外，报告 SHA-256 为 `7919c38436c2098f3bb39b5e1584fe19874c7fea6d8e51f91e40ea457baf07a5`，探针 SHA-256 为 `972c9b5441be34bd7a4c8013ce8df1f60cc377165ecc3b119d841ff11f0b09ce`。

## 长推理摘要到达时间

同日复用上述签名 Desktop、隔离 profile、注册和安装包。临时 Cordis 探针以 `gpt-6.1-sol`、`high`、`concise` 请求公开 SIWC。计时起点为宿主开始 POST，使用单调时钟记录首个非空摘要增量、首段摘要完成、首个非空正文增量及终态。排序题要求输出合法排列总数、字典序首尾和第四位的计数，预先用本地穷举计算答案。计时覆盖原始 SSE 到达，Desktop UI 渲染时间未测。[Responses 流事件](https://developers.openai.com/api/reference/resources/responses/streaming-events#response-reasoning_summary_text-delta)

| 任务 | 首个摘要增量 | 首段摘要完成 | 首个正文增量 | `response.completed` |
|---|---:|---:|---:|---:|
| 九项排序 | 15.424 秒 | 15.427 秒 | 未收到 | 180 秒探针超时 |
| 七项排序 | 10.619 秒 | 10.620 秒 | 52.826 秒 | 65.365 秒 |

七项排序返回 HTTP 200，答案与穷举一致。上游发出 48 个非空摘要增量，完成 8 段摘要，终态含 538 字符摘要并回报 2,070 个 reasoning token。首段完整摘要比首个正文增量早 42.206 秒，比终态早 54.745 秒。当前 adapter 在终态投影摘要并实时转发正文，因此两处差值分别表示填补正文前等待的时间和相对于当前摘要展示的可提前时间。九项排序在探针超时前收到 19 段完整摘要，未取得正文或终态时间。两次各跑一次。[当前摘要投影与终态结算](../../src/host/responses-stream.ts#L192-L219)

两次均确认账号和注册复用。复测结束后原账号保持连接并保留可续期授权。隔离 Desktop 已关闭，临时配置已恢复。完成样本报告 SHA-256 为 `f99f104cd6cbff0e276f98183f0d237bbd1e814e5353f424e3b4aff372e3f0ab`，探针 SHA-256 为 `e992280cdfb80a3c956a5b5c3defb63498ad67e01afd4801a1276835994f18ec`。超时样本报告 SHA-256 为 `0e21f9b65b35b1a4bb31d78d60251fedbd6a75ef590e6bad9cdf7fe5b7511f4a`，探针 SHA-256 为 `1003247a8b73d59d0725885799f63c50c4ec9f3b22dd534e0cbb02161b3b1d8f`。

## 流式摘要候选包验收

2026-11-13（Asia/Shanghai），W2 摘要、W4、L4。沿用同一签名 macOS ARM64 Desktop `0.2.2-rc.1`、隔离 profile 和原登录。随附 CLI 用原隔离 pnpm store 安装候选包，包 SHA-256 为 `52975bdde0d1a2b57c6eefe4b7424599b961046423e63de55634df53492f78e7`。安装后 Host 入口 SHA-256 与构建入口相同，均为 `5cc8bab13fc27252a80ec820c19b0073840989da2f991cf1ff143b2d70dccc1c`。候选基于 `87b5b40` 和工作树改动，`git diff -- src` 的 SHA-256 为 `b76038549ddd63e78433cd6764498f1cfb58712a0770654da35045e246b99c3f`。首次 CLI 安装采用系统 pnpm store 并被拒绝，改用原隔离 store 后通过。

在 Desktop 原生会话中用 `gpt-6.1-sol` 分别选择 `high` 和「提供方默认」。各提交两轮。首轮用可校验的七项排序题，续聊用首轮的计数做运算。观察原生推理行并在出现时展开，记录第一段可见摘要文字及正文标记的到达时间。关闭宿主后从原生持久化会话复核首个摘要增量早于首个正文增量。

| 档位 | 界面首段可见摘要 | 界面正文标记 | 首段摘要领先正文标记 | 终态推理行与加密项 | 同会话续聊 |
|---|---:|---:|---:|---|---|
| `high` | 10.442 秒 | 27.100 秒 | 16.658 秒 | 3 行、3 项 | 完成，答案正确 |
| 提供方默认 | 18.615 秒 | 27.885 秒 | 9.270 秒 | 2 行、2 项 | 完成，答案正确 |

界面时间从提交前启动观察时计。两组完成后推理行数量与各自终态块一致，正文出现前已能读到摘要。已提交的摘要文字与回放中的终态摘要相同。原生持久化记录的首个摘要增量分别比首个正文增量早 16.673 秒和 9.276 秒。首轮答案均与穷举一致，续聊两组均得到 95。界面测量首轮各一个样本。

`npm test` 76 项通过，覆盖能力值为 `true`、`false`、缺失及格式错误的请求行为，提供方默认省略 `effort`，增量先于正文，同一摘要块合并重复的完成事件，终态补齐，续聊回传加密 item，以及中断留下的显示摘要和错误 item ID 的处理。lint、typecheck、包检查通过。[离线回归](../../test/p3/responses.test.mjs)

首次界面观察用 `innerText` 读取摘要，实际渲染器返回空值。改用展开后正文的 DOM 文本及布局矩形完成复跑。验收后账号仍为 `connected`，登录保留，隔离 Desktop 已关闭。验收过程中模型选择器写入了默认档，结束时已恢复原 profile 配置。脱敏界面报告 SHA-256 为 `b296c979fe3651736e67ec2e92cbb50ba2ba1d113ac0ea1abd5607caf1c2143e`，原生事件对照 SHA-256 为 `575ac3907c120ff073447277a269a42cd285e5b3c57b90660efba2bfbb520661`。
