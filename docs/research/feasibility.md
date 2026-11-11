# 可行性结论与复用决策

2026-11-11 更新。DSH 公开 Host 接口支持独立 provider 接入。P3 已通过合成推理和隔离宿主验收。本机 Web 和官方 Desktop 已以真实订阅验证模型目录、文本和会话恢复，Desktop 已验证工具审批与回传。[P3 验收](../evidence/p3-acceptance-2026-11-11.md) · [P4 双宿主实测](../evidence/p4-local-native-2026-11-11.md)

## 分层结论

| 层面 | 判定 | 依据／剩余条件 |
|---|---|---|
| 官方公开路径 | 已有文档依据 | [OSS/local SIWC](https://developers.openai.com/siwc/token-sharing-open-source.md)提供动态注册、授权及 public Responses 推理路径 |
| DSH 原生流程 | 隔离 composition 已核对 | 已发布的 `0.2.2-rc.1` 接口可挂载模型、授权和凭据。[宿主快照](dsh-contracts.md) |
| 只改现有 provider 配置 | 当前独立路由不满足 | pi-ai 公开路径发送裸函数及显式 system，拒绝 `models[]`，无法按现有配置满足本项目契约。[抓包结果](../evidence/p0-offline-2026-11-11.md#pi-ai-对照) |
| 专用 Adapter | 维持现有设计 | 同宿主插件通过 `onPayload` 在 pi-ai 上补齐请求转换。当前专用路由保留 DSH 的工具和重试边界。实测 SIWC `call_id` 上限为 64 字符，使用固定长度映射可从原 OpenAI 路由续接工具历史。长 SSE 保活后仍须收到真实完成终态。[Responses 对照及离线探针](responses-protocol-comparison.md) · [跨路由实测](../evidence/p4-local-native-2026-11-11.md#跨-provider-回放) |
| 官方 SDK | Host 固定 `openai@7.55.0` | 官方预览要求 `store:false`、`stream:true`，本地函数可用 namespace 或 `additional_tools` 声明，本项目选择 namespace。合成测试核对固定端点、单次发送和终态，Desktop 实测 namespace 工具结果回传。[官方推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) · [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) · [本机证据](../evidence/p4-local-native-2026-11-11.md#实机结果) |
| 本项目准入 | 选定 OSS／本地路径 | 项目采用 MIT。插件免费，用户在本机 Web 或官方 Desktop 自管账号和凭据。[许可证](../../LICENSE) · [SIWC Overview](https://developers.openai.com/siwc/token-sharing-open-source) |
| 账号／workspace／模型可用 | 已实测一个工作区 | 同一已验证邮箱的两条注册分别可用。在本机双宿主验证 `gpt-6-sol` 和 `gpt-6.1-sol`。默认自动压缩开启时，无容量元数据的模型切换仍受 DSH `0.2.2-rc.1` 限制。[本机证据](../evidence/p4-local-native-2026-11-11.md) · [宿主快照](dsh-contracts.md#主对话与辅助请求) |
| 发布／多版本支持 | 待验收 | 离线宿主结果限定在固定 DSH 版本。完整宿主支持范围和发布条件见[实施计划](../implementation-plan.md)。[P2 双宿主证据](../evidence/p2-host-2026-11-11.md) |

## 选择与取舍

1. 使用自身真实应用名称和稳定 host ID，走 dynamic registration；不借用 Codex、Hermes 或其他应用身份。
2. 首选专用 `chatgpt-siwc` provider。保留 DSH 的上下文、持久会话、工具执行、审批、沙箱和单次 attempt 重试契约。
3. 最小实现优先选经 P0 核对的官方 SDK 作为 Host 内部传输。保持低层调用与每 attempt 单次发送，在插件内限制请求字段，按 `response.completed` 判定成功。
4. 批准最小实现时复核该 SDK 版本及维护状态。变更版本或改用直接 HTTP/SSE 时复跑相同协议用例。
5. 系统浏览器交接复用 DSH 同版的 `@deepseek-ai/dsh-subprocess` 清理子进程环境。联机入口由隔离 profile 显式开启。[包清单](../../package.json) · [交接验证](../evidence/p4-candidate-2026-11-11.md)

## 验收入口

设计进入条件、最小账号验证和剩余工作由[实施计划](../implementation-plan.md)维护。主对话、辅助路由、会话恢复、账号生命周期和发布通过条件由[验收标准](../acceptance.md)维护。

## 范围

MVP 为本地 Web 和官方 Desktop、多个可保存注册与每个 profile 一个活动账号／workspace、文本和本地函数工具、流式推理、明确登出。其他宿主载体另行验证。

不包含：浏览器凭据、账号池／额度轮转、付费远程托管、共享 token、自建 OAuth 中转、backend-api 回退、读取其他应用的登录缓存、OpenAI hosted tools。自托管 VM 有官方专门流程，但不属于首版自动迁移功能。

## 研究边界

官方公开依据见[研究快照](openai-siwc.md)和 [P0 核对](../evidence/p0-offline-2026-11-11.md#openai-公开契约和准入)。本地凭据文件可被同 OS 用户或同进程插件读取。详见[安全设计](../security.md)。
