# 分阶段实施计划

当前已完成立项接入及 [P0 首轮离线核对](evidence/p0-offline-2026-11-11.md)。P0 尚未退出，P1–P5 待开始。阶段结果按[验收标准](acceptance.md)判定。

## P0：可行性验证与方案锁定

基线为 DSH `0.2.2-rc.1`。使用[基座锁](../dsh-engineering.lock.json)及[离线复跑入口](../test/README.md)。

- [ ] 确认实际运行、收费和分发形态。由项目所有者确定 OSS 许可，或核实实际形态所需的商业／托管准入。
- [x] 在隔离 Cordis composition 编译、挂载及释放公开 adapter 和授权 flow。用合成 grant 和 `models[]` 核对目录、通知及省略 context 的行为。
- [x] 用已发布的 DSH pi-ai adapter 与 pi-ai `1.3.0` 捕获请求和流。独立路由的请求、目录和用量有明确缺口，选择专用 adapter。
- [x] 用 `openai@7.55.0` 核对请求类型、namespace、replay 请求字段、取消、单次发送及原始 SSE 终态。选为候选 transport，协议校验与结算由插件负责。
- [ ] 决定首个受支持的请求入口及辅助路由策略。在公开配置下验证 title／compaction、切换和 resume。缺 context 或辅助请求强制输出上限时，按[接口快照](research/dsh-contracts.md)解决后再声明支持。
- [ ] 确定最小 Client／Host 交互及账户 lifecycle。选定公开 Slot，确认安全的浏览器启动与账户切换路径，验证共享记录的世代保护和合成 refresh/logout 竞争。
- [ ] 经另行授权，做自身 app 身份的首次登录＋目录＋最小推理；失败区分准入与实现错误。

进入 P1 前，确定分发形态与准入、首个支持的宿主入口及辅助路由、凭据世代提交策略和最小 UX 路径。P0 退出另需经授权的最小账号验证。若账号验证尚未授权，计划只记录实际通过的离线范围。

## P1：标准包与离线基础

依赖：P0 的离线架构选择及上述 P1 进入条件。

- [ ] TypeScript ESM 构建，标准 manifest／Host export／bundle patch。按 DSH 精确版本声明 engine 和宿主 peer。
- [ ] 独立 row／provider、英文与中文展示资源、原创 icon、分发文件清单。展示元信息可参考[基座 PR #8 的合并版本](https://github.com/takboo/dsh-plugin-engineering/blob/1393e85ca4c59afcb9cd0fa23caa8a19640d0f27/docs/distribution.md#已安装插件的展示元信息)。
- [ ] 建立 lint/typecheck/build/test/pack 检查，选择一个包管理器并提交对应 lockfile；无必要安装脚本。
- [ ] 注入时钟、HTTP 与 store 的测试 seam；记录输入冻结与 effect 释放测试。

退出：隔离 composition 加载和卸载、路由冲突测试通过；文档与实际命令一致。不在当前日用 profile 试装。

## P2：OAuth、凭据和模型目录

依赖：P1；P0 账号 gate 通过后才做 live 分支。

- [ ] 首次／后续授权、PKCE/OIDC/issued client ID、scope 与身份绑定。
- [ ] 实际 backing 的跨进程 refresh rotation、过期、取消、logout race；错误脱敏。
- [ ] models[] 目录、visibility、空目录、TTL、账号切换失效、GUI 目录更新。

退出：A1–A6、C1–C3、S1–S4 全通过，秘密 canary 不出 Host／安全 store。

## P3：Responses 与 DSH 工具闭环

依赖：P2。

- [ ] 完整 history／system-developer／字段白名单／namespace 转换和逆映射。
- [ ] 流 block／terminal／usage／reasoning replay／取消／timeout，SDK 不隐藏重试。
- [ ] DSH 工具审批拒绝、允许、结果回传、下一轮完成与恢复。

退出：W1–W6、T1–T4、L1–L4 全通过；失败 stream 不触发工具执行。

## P4：隔离 profile 与真实账号验收

依赖：P3，另行授权安装和账号使用。

- [ ] 按 L5 与 B1 完成 GUI、CLI 可用面和主对话／title／compaction／resume；实际不支持的入口收窄并公开说明。
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
