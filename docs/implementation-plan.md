# 分阶段实施计划

已提交的实现基线通过 [P3 离线验收](evidence/p3-acceptance-2026-11-11.md)。当前推进 [P4 实机验收](#p4隔离-profile-与真实账号验收)，实测结论对应报告中标识的本地工作树候选。通过条件见[验收标准](acceptance.md)，各阶段原始记录见[证据索引](evidence/README.md)。

## P0：可行性验证与方案锁定

基线为 DSH `0.2.2-rc.1`。使用[基座锁](../dsh-engineering.lock.json)及[离线复跑入口](../test/README.md)。

- [x] 确定 MIT 许可、插件免费、本地运行、用户自管账号和凭据，按 OSS／本地 SIWC 路径实施。[许可证](../LICENSE)
- [x] 在隔离 Cordis composition 编译、挂载及释放公开 adapter 和授权 flow。用合成 grant 和 `models[]` 核对目录、通知及省略 context 的行为。
- [x] 用已发布的 DSH pi-ai adapter 与 pi-ai `1.3.0` 捕获请求和流。独立路由的请求、目录和用量有明确缺口，选择专用 adapter。
- [x] 用 `openai@7.55.0` 核对请求类型、namespace、replay 请求字段、取消、单次发送及原始 SSE 终态。选为候选 transport，协议校验与结算由插件负责。
- [x] 首版同时以本地 Web 和官方 Desktop 为目标。确定隔离 profile 的辅助路由边界，以及主对话、模型切换和重启恢复用例。真实宿主结果按 L5 分别记录。
- [x] 确定插件详情设置入口、Host 浏览器回调、每个 `DSH_HOME` 的稳定宿主 ID 和账号隔离方案。
- [x] P4 本地候选已用自身 app 身份完成经授权的真实账号登录、目录和最小文本推理。[真实账号证据](evidence/p4-real-account-2026-11-11.md#responsemetadata-兼容修复和最小推理通过)

## P1：标准包与离线基础

依赖 P0 的离线架构选择。

- [x] TypeScript Host ESM 和 DSH Client factory，标准 manifest、Host export 与独立 bundle patch。engine 固定 `0.2.2-rc.1`，使用宿主 peer。
- [x] 独立 row／provider、双语展示资源、原创 icon 和分发文件清单。设置入口通过公开 bundle 插槽显示当前构建状态。[基座 PR #8](https://github.com/takboo/dsh-plugin-engineering/blob/1393e85ca4c59afcb9cd0fa23caa8a19640d0f27/docs/distribution.md#已安装插件的展示元信息)
- [x] 使用 npm 锁文件和 lint、typecheck、build、test、pack 检查。Host 入口验证冻结输入与 effect 释放。
- [x] P2 的 Host 可注入时钟、HTTP 和浏览器启动器，竞争用例使用官方本地 backing 和合成凭据。

离线包骨架的通过条件为隔离 composition 加载、卸载、路由冲突和打包检查均通过。真实安装使用另行授权的隔离 profile。

## P2：OAuth、凭据和模型目录

依赖 P1。合成授权用于离线验收，真实账号用例随 P4 执行。

- [x] 实现首次／后续授权、loopback、PKCE、OIDC/JWKS、issued client ID、scope 与身份绑定。离线 Host 使用可注入传输，默认构建不启用真实账号连接。
- [x] 在实际本地 backing 上使用合成凭据验证跨进程轮转、写入失败和迟到授权，区分本地清理与远端撤销。
- [x] 实现 `models[]` 目录、visibility、空目录、TTL、账号切换失效和 DSH 目录通知。插件详情页通过 owner-only Typert 操作查看脱敏状态。
- [x] 同一离线候选包通过实际 Web 和官方 macOS ARM64 Desktop 的安装、插件详情设置和 Host 状态读取。Web 验证旧版本拒绝与卸载，Desktop 验证重启恢复。[双宿主证据](evidence/p2-host-2026-11-11.md)

退出：A1–A6、C1–C3、S1–S4 全通过，秘密 canary 不出 Host／安全 store。

## P3：Responses 与 DSH 工具闭环

离线工作基于 P2 已验证的授权和目录。真实工具闭环随 P4 验收。

- [x] 通过 DSH LLM route 和合成授权接通单次 Responses 请求、文本流、受限的 namespace function、用量及终态。在重建的 adapter 中回传工具结果和加密推理状态。[首轮离线证据](evidence/p3-offline-2026-11-11.md)
- [x] 验证完整历史、原生压缩检查点、system 到 developer、字段白名单、namespace 逆映射和动态工具投影。
- [x] 验证交错流、终态、用量、版本化 reasoning 回放、并发模型、停止、超时和热卸载取消。SDK 每个 attempt 单次发送。
- [x] 原生工具审批允许一次写入、用户拒绝与只读文件沙箱拒绝。失败流中的候选工具不进入执行队列。[隔离宿主证据](evidence/p3-native-2026-11-11.md)
- [x] DSH 在提交工具结果后重试失败请求。验证单次发送、无重复写入、额度失败不重试，以及跨进程从 JSONL 恢复和派生会话。

退出：W1–W6、T1–T4、L1–L4 全通过；失败 stream 不触发工具执行。

## P4：隔离 profile 与真实账号验收

依赖 P3 和另行授权的安装、账号使用。按[交互验收流程](../test/README.md#p4-交互验收)复跑。

- [x] 同一离线包通过 Web 和 Tart Desktop 的隔离安装与交接演练。[环境证据](evidence/p4-interactive-2026-11-11.md)
- [x] 本地联机候选通过两种宿主的 OAuth 入口开关、系统浏览器启动、取消和 Clash TUN 无凭据预检。[候选证据](evidence/p4-candidate-2026-11-11.md)
- [x] 本机 Web 候选通过真实登录、目录、复用原注册重新授权、最小文本推理及远端撤销。[实测证据](evidence/p4-real-account-2026-11-11.md#responsemetadata-兼容修复和最小推理通过)
- [ ] 完成 Desktop 真实账号授权和目录验证（R1）。Tart 的手机扫码曾因来宾蓝牙不可用而阻塞。[历史记录](evidence/p4-real-account-2026-11-11.md#tart-扫码复试和本机-web-验证)
- [ ] 用同一候选包完成 Web、Desktop 的主对话、模型选择与切换、辅助路由限制、插件设置及 Composer plan 状态验收（L5、U1、B2）。按实际验收的操作系统和版本声明支持。
- [ ] 完成真实工具审批、执行及工具结果回传（R2），验证停止、令牌刷新、重启续接（R3）。记录安全 request ID 和用量可见性。
- [ ] 验证与原 provider 共存、禁用、卸载和重启（B1），恢复试验前状态。

退出：U1、R1–R3 及其他 mandatory 用例均 pass，无“跳过当通过”；提供同一产物的身份和脱敏证据。

## P5：发布准备（是否发布另行决定）

依赖：P4，用户批准发布，确认许可／准入未变化。

- [ ] 许可证、第三方声明、隐私与数据流说明、依赖审计和支持矩阵。
- [ ] 打包文件与元数据检查，token canary 扫描，隔离 profile 安装同一包验证。
- [ ] 安装、更新、登出、撤销、卸载、限制、故障排查、回滚文档；发布产物摘要。

退出：全部 mandatory 验收与实际发布证据完整。构建、安装、真实推理、发布四类结果分别报告。

## 并行工作与写入 scope

可并行研究 auth 与 codec fixture，但入口挂载、依赖锁、manifest 和集成变更统一由集成人维护。建议 scope：auth＋security tests；codec＋wire fixtures；catalog＋catalog tests；集成人负责 entry/manifest/docs 与最终检查。P3 的工具集成依赖 P2 grant／catalog；不得在未锁定契约前各自实现不兼容格式。
