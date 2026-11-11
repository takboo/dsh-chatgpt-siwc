# DSH ChatGPT SIWC

为 DeepSeek Harness 规划的 Sign in with ChatGPT 模型 provider 插件。使用自身应用身份与 OpenAI 公开接口，让 DSH 继续负责上下文、Agent 循环、会话记录、工具审批及执行。

> **阶段：P3 离线实现。** 首版目标为本地 Web 和官方 Desktop。P2 离线候选已通过两个宿主的安装和设置验证。P3 实现 Responses 推理、工具回传和会话回放，验收使用合成账号和替身传输。默认构建仍停用真实账号连接。[实施计划](docs/implementation-plan.md)

## 开始阅读

- [文档索引](docs/README.md)：按任务找到研究、设计、计划和验收。
- [可行性研究](docs/research/feasibility.md)：已证实事项、复用评估、风险和继续条件。
- [实施方案](docs/architecture.md)：Host Adapter、OAuth、凭据和协议转换。
- [实施计划](docs/implementation-plan.md)：阶段、依赖、产物和退出条件。
- [验收标准](docs/acceptance.md)：自动化、集成、安全和真实账号验收。

## 工作区约定

- 拟用 package：`@local/dsh-chatgpt-siwc`；provider：`chatgpt-siwc`。两者均为项目自定义名称，不表示官方认证。
- [共享基座锁](dsh-engineering.lock.json)固定接入契约。[P0 报告](docs/evidence/p0-offline-2026-11-11.md)记录 DSH `0.2.2-rc.1`、Cordis `4.1.0` 和传输依赖的核对结果。
- 项目采用 [MIT 许可](LICENSE)，插件在用户本地运行。[包清单](package.json)定义私有候选包，[测试入口](test/README.md)提供构建、探针与包校验方式。
- 安装、账号登录与真实推理须另行授权，并使用隔离 profile。发布须单独授权。
