# 分阶段实施计划

已完成 [P0 首轮离线核对](evidence/p0-offline-2026-11-11.md)和 [P1 包骨架](evidence/p1-offline-2026-11-11.md)，已进入离线 P2。P0 的真实账号验证仍待授权。阶段结果按[验收标准](acceptance.md)判定。

## P0：可行性验证与方案锁定

基线为 DSH `0.2.2-rc.1`。使用[基座锁](../dsh-engineering.lock.json)及[离线复跑入口](../test/README.md)。

- [x] 确定 MIT 许可、插件免费、本地运行、用户自管账号和凭据，按 OSS／本地 SIWC 路径实施。实际账号与工作区的推理资格待实测。[许可证](../LICENSE)
- [x] 在隔离 Cordis composition 编译、挂载及释放公开 adapter 和授权 flow。用合成 grant 和 `models[]` 核对目录、通知及省略 context 的行为。
- [x] 用已发布的 DSH pi-ai adapter 与 pi-ai `1.3.0` 捕获请求和流。独立路由的请求、目录和用量有明确缺口，选择专用 adapter。
- [x] 用 `openai@7.55.0` 核对请求类型、namespace、replay 请求字段、取消、单次发送及原始 SSE 终态。选为候选 transport，协议校验与结算由插件负责。
- [x] 首版同时以本地 Web 和官方 Desktop 为目标。隔离试验 profile 停用 LLM 自动标题、自动压缩及手动 `/compact`，验证主对话、模型切换与重启恢复。需要辅助模型时由用户显式配置路由。真实宿主结果按 L5 分别记录。
- [x] 设置使用插件详情页的 `plugins.bundle.config`。Host 打开系统浏览器并处理回调。每个 `DSH_HOME` 固定 Host ID，注册各自存储，每个 profile 只激活一个。使用锁内 `generation` 校验，先做合成竞争验证。
- [ ] 经另行授权，做自身 app 身份的首次登录＋目录＋最小推理；失败区分准入与实现错误。

离线 P1 依上述已确定的范围推进。P0 退出另需经授权的最小账号验证。

## P1：标准包与离线基础

依赖：P0 的离线架构选择及上述 P1 进入条件。

- [x] TypeScript Host ESM 和 DSH Client factory，标准 manifest、Host export 与独立 bundle patch。engine 固定 `0.2.2-rc.1`，使用宿主 peer。
- [x] 独立 row／provider、双语展示资源、原创 icon 和分发文件清单。设置入口通过公开 bundle 插槽显示当前构建状态。[基座 PR #8](https://github.com/takboo/dsh-plugin-engineering/blob/1393e85ca4c59afcb9cd0fa23caa8a19640d0f27/docs/distribution.md#已安装插件的展示元信息)
- [x] 使用 npm 锁文件和 lint、typecheck、build、test、pack 检查。Host 入口验证冻结输入与 effect 释放。
- [x] P2 的 Host 可注入时钟、HTTP 和浏览器启动器，竞争用例使用官方本地 backing 和合成凭据。

离线包骨架的通过条件为隔离 composition 加载、卸载、路由冲突和打包检查均通过。真实安装使用另行授权的隔离 profile。

## P2：OAuth、凭据和模型目录

依赖：P1；P0 账号 gate 通过后才做 live 分支。

- [x] 实现首次／后续授权、loopback、PKCE、OIDC/JWKS、issued client ID、scope 与身份绑定。离线 Host 使用可注入传输，默认构建不启用真实账号连接。
- [x] 在实际本地 backing 上使用合成凭据验证跨进程轮转、写入失败和迟到授权，区分本地清理与远端撤销。
- [x] 实现 `models[]` 目录、visibility、空目录、TTL、账号切换失效和 DSH 目录通知。插件详情页通过 owner-only Typert 操作查看脱敏状态。
- [x] 同一离线候选包通过实际 Web 和官方 macOS ARM64 Desktop 的安装、插件详情设置和 Host 状态读取。Web 验证旧版本拒绝与卸载，Desktop 验证重启恢复。[双宿主证据](evidence/p2-host-2026-11-11.md)
- [ ] 真实账号验证、Host 打开系统浏览器和两个宿主的模型选择器仍待实测。Composer 的 plan 状态随推理路由接入后验证。

退出：A1–A6、C1–C3、S1–S4 全通过，秘密 canary 不出 Host／安全 store。

## P3：Responses 与 DSH 工具闭环

依赖：P2。

- [ ] 完整 history／system-developer／字段白名单／namespace 转换和逆映射。
- [ ] 流 block／terminal／usage／reasoning replay／取消／timeout，SDK 不隐藏重试。
- [ ] DSH 工具审批拒绝、允许、结果回传、下一轮完成与恢复。

退出：W1–W6、T1–T4、L1–L4 全通过；失败 stream 不触发工具执行。

## P4：隔离 profile 与真实账号验收

依赖：P3，另行授权安装和账号使用。

- [ ] 按 L5 与 B1 分别完成本地 Web、官方 Desktop 的主对话、模型切换、重启恢复、辅助路由限制、插件设置入口与共存验收。按实际测试的 Desktop 操作系统和版本声明支持。
- [ ] 真实会话的文本、工具、停止、重启续接；记录 request ID 与用量可见性，尽量低消耗。
- [ ] 与原 provider 共存；disable/unload/重启不破坏其他插件；恢复测试前状态。

退出：U1、R1–R3 及其他 mandatory 用例均 pass，无“跳过当通过”；提供同一产物的身份和脱敏证据。

## P5：发布准备（是否发布另行决定）

依赖：P4，用户批准发布，确认许可／准入未变化。

- [ ] 许可证、第三方声明、隐私与数据流说明、依赖审计和支持矩阵。
- [ ] 打包文件与元数据检查，token canary 扫描，隔离 profile 安装同一包验证。
- [ ] 安装、更新、登出、撤销、卸载、限制、故障排查、回滚文档；发布产物摘要。

退出：全部 mandatory 验收与实际发布证据完整。构建、安装、真实推理、发布四类结果分别报告。

## 并行工作与写入 scope

可并行研究 auth 与 codec fixture，但入口挂载、依赖锁、manifest 和集成变更统一由集成人维护。建议 scope：auth＋security tests；codec＋wire fixtures；catalog＋catalog tests；集成人负责 entry/manifest/docs 与最终检查。P3 的工具集成依赖 P2 grant／catalog；不得在未锁定契约前各自实现不兼容格式。
