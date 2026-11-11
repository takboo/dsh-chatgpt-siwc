# 文档索引

P3 离线验收已通过，P0 真实账号验证待执行。[项目首页](../README.md)说明交付范围，[实施计划](implementation-plan.md)记录阶段门。

| 任务 | 必读 |
|---|---|
| 判断能否做、是否直接复用 pi-ai | [可行性研究](research/feasibility.md) |
| 核对 OpenAI 官方协议与准入依据 | [官方研究](research/openai-siwc.md) |
| 核对宿主接口、辅助请求与 Client 扩展点 | [DSH 接口快照](research/dsh-contracts.md) |
| 实施模型请求、登录、目录和生命周期 | [实施方案](architecture.md) |
| 处理令牌、账号切换、登出、日志 | [安全设计](security.md) |
| 安排开发顺序与决策门 | [实施计划](implementation-plan.md) |
| 设计测试、决定能否发布 | [验收标准](acceptance.md) |
| 复跑 P0 离线核对 | [P0 报告](evidence/p0-offline-2026-11-11.md) · [测试入口](../test/README.md) |
| 构建和核对 P1 包骨架 | [P1 报告](evidence/p1-offline-2026-11-11.md) · [测试入口](../test/README.md) |
| 复核 P2 账号、目录和设置页面 | [P2 报告](evidence/p2-offline-2026-11-11.md) · [测试入口](../test/README.md) |
| 复核 P2 实际 Web 与官方 macOS Desktop | [双宿主报告](evidence/p2-host-2026-11-11.md) · [隔离宿主复跑](../test/README.md#p2-隔离宿主) |
| 复核 P3 Responses 首轮闭环 | [P3 离线证据](evidence/p3-offline-2026-11-11.md) · [测试入口](../test/README.md#p3-离线-responses) |
| 复核 P3 原生审批、文件沙箱、重试及会话恢复 | [隔离宿主证据](evidence/p3-native-2026-11-11.md) · [复跑命令](../test/README.md#p3-隔离宿主验证) |
| 复核 P3 阶段验收与候选包身份 | [验收矩阵](evidence/p3-acceptance-2026-11-11.md) · [复跑命令](../test/README.md#p3-隔离宿主验证) |
| 记录验证结果 | [证据规则与模板](evidence/README.md) |

事实引用以官方主源与本机已核对宿主为依据。计划条目不是已实现行为；测试设计不是通过记录。官方 preview 及 DSH RC 都可能变化，开始实施与发布前必须重核。
