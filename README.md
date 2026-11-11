# DSH ChatGPT SIWC

DeepSeek Harness 的 Sign in with ChatGPT 模型 provider 插件。插件使用自身应用身份与 OpenAI 公开接口，DSH 负责上下文、Agent 循环、会话记录、工具审批和执行。

P4 已通过 macOS ARM64 上的本机 Web 和官方 Desktop `0.2.2-rc.1` 隔离验收。已测 profile 停用模型生成标题及手动和自动压缩。联机授权默认关闭。[实测与已知限制](docs/evidence/p4-local-native-2026-11-11.md) · [P5 发布准备](docs/implementation-plan.md#p5发布准备是否发布另行决定)

## 开发与验收

- 包名为 `@local/dsh-chatgpt-siwc`，provider ID 为 `chatgpt-siwc`。项目采用 [MIT 许可](LICENSE)，[包清单](package.json)定义私有候选包。
- 换电脑继续开发从[换机接手](docs/README.md#换机接手)开始。研究、架构和验收入口见[文档索引](docs/README.md)。
