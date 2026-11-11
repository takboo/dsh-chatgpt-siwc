# 文档索引

[项目首页](../README.md)说明交付范围，[实施计划](implementation-plan.md)记录当前阶段和待验项目。

| 任务 | 必读 |
|---|---|
| 判断能否做、是否直接复用 pi-ai | [可行性研究](research/feasibility.md) |
| 核对 OpenAI 官方协议与准入依据 | [官方研究](research/openai-siwc.md) |
| 核对宿主接口、辅助请求与 Client 扩展点 | [DSH 接口快照](research/dsh-contracts.md) |
| 实施模型请求、登录、目录和生命周期 | [实施方案](architecture.md) · [源码布局](../src/README.md) |
| 处理令牌、账号切换、登出、日志 | [安全设计](security.md) |
| 安排开发顺序与决策门 | [实施计划](implementation-plan.md) |
| 设计测试、决定能否发布 | [验收标准](acceptance.md) |
| 构建、复跑离线测试或进行 P4 交互验收 | [测试入口](../test/README.md) |
| 查阅历史验证或记录新结果 | [证据索引和模板](evidence/README.md) |

事实引用以官方主源与本机已核对宿主为依据。计划条目不是已实现行为；测试设计不是通过记录。官方 preview 及 DSH RC 都可能变化，开始实施与发布前必须重核。
