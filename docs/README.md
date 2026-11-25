# 文档索引

[项目首页](../README.md)说明交付范围，[实施计划](implementation-plan.md)记录当前阶段和待验项目。

## 换机接手

1. 在新电脑从 GitHub 获取本仓库的 `main`，确认工作树干净。先看 [P4 本机结果](evidence/p4-local-native-2026-11-11.md)和 [P5 发布准备](implementation-plan.md#p5发布准备是否发布另行决定)。默认自动压缩下的模型切换限制随已验证版本记录。
2. 准备运行时与基座：执行 `mise trust && mise install`（锁定 Node `24.22.2`），按[基座锁](../dsh-engineering.lock.json)取得 `dsh-plugin-engineering` 并配置 `DSH_ENGINEERING_CHECKOUT`（或 `~/.config/dsh-plugin-engineering/checkout`）。运行 `locked-run.mjs doctor` 核对 origin、tag、SHA 与运行时，需要查阅基座契约时执行 `locked-run.mjs docs .agents/skills/dsh-plugin-onboarding/SKILL.md`（或 `docs/engineering-contract.md`）。完整门禁见[工作流与验证门禁](workflow.md)。
3. 执行 `mise run setup` 安装锁定依赖、`mise run check` 运行 `E0`/`E1` 全量检查（含 `check:shell` 与候选包元数据校验）。需要 Linux 宿主回归时执行 `mise run verify:host`（经 `locked-run.mjs container` 跑 CLI 与固定 Chromium Web）；涉及 Host 原生集成或 macOS 来宾时使用[P3 原生容器探针](../test/README.md#p3-隔离宿主验证)或 `locked-run.mjs tart`。记录本次包摘要、`provenance` 与实际宿主版本。需要逐字节复建 P4 实测包时，使用[证据中的复建提交和工具链](evidence/p4-local-native-2026-11-11.md#复跑与配置)。
4. 源码、锁文件和脱敏证据随 Git 迁移。候选包可在新机重新构建。真实授权和宿主 ID 保存在各自的隔离 `DSH_HOME`。需要实机复测时，在新机创建隔离 profile 并由用户完成授权，按[本机流程](../test/README.md#本机真实账号验收)和[凭据留存规则](security.md#真实账号复测)操作。

## 按任务查阅

| 任务 | 必读 |
|---|---|
| 了解验证门禁、mise 任务、基座调度与 E0–E4 分级 | [工作流与验证门禁](workflow.md) |
| 判断能否做、是否直接复用 pi-ai | [可行性研究](research/feasibility.md) |
| 比较同类项目的请求转换、流与回放 | [Responses 协议转换对照](research/responses-protocol-comparison.md) |
| 核对 OpenAI 官方协议与准入依据 | [官方研究](research/openai-siwc.md) |
| 核对宿主接口、辅助请求与 Client 扩展点 | [DSH 接口快照](research/dsh-contracts.md) |
| 实施模型请求、登录、目录和生命周期 | [实施方案](architecture.md) · [源码布局](../src/README.md) |
| 处理令牌、账号切换、登出、日志 | [安全设计](security.md) |
| 安装、更新、排查与回退本地候选 | [本地安装与维护](local-install.md) |
| 安排开发顺序与决策门 | [实施计划](implementation-plan.md) |
| 设计测试、决定能否发布 | [验收标准](acceptance.md) |
| 构建、复跑离线测试或进行 P4 交互验收 | [测试入口](../test/README.md) |
| 查阅历史验证或记录新结果 | [证据索引和模板](evidence/README.md) |

事实引用以官方主源与本机已核对宿主为依据。计划条目不是已实现行为；测试设计不是通过记录。官方 preview 及 DSH RC 都可能变化，开始实施与发布前必须重核。
