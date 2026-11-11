# DSH ChatGPT SIWC

DeepSeek Harness 的 Sign in with ChatGPT 模型 provider 插件。插件使用自身应用身份与 OpenAI 公开接口，DSH 负责上下文、Agent 循环、会话记录、工具审批和执行。

首版目标为本地 Web 和官方 Desktop。当前提交的实现已通过 P3 离线验收。P4 本地候选已在隔离 Web profile 中通过真实最小文本推理，双宿主实机验收进行中。[实施计划](docs/implementation-plan.md#p4隔离-profile-与真实账号验收) · [实测记录](docs/evidence/p4-real-account-2026-11-11.md)

## 开发与验收

- 包名为 `@local/dsh-chatgpt-siwc`，provider ID 为 `chatgpt-siwc`。项目采用 [MIT 许可](LICENSE)，[包清单](package.json)定义私有候选包。
- 研究、架构和验收入口见[文档索引](docs/README.md)。构建、隔离运行和打包步骤见[测试入口](test/README.md)。
