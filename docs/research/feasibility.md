# 可行性结论与复用决策

2026-11-11 更新。**DSH 公开 Host 接口支持独立 provider 的基本接入。P0 已完成首轮离线验证，准入、辅助请求、UX 与凭据竞争仍有进入条件。** 结果见 [P0 证据](../evidence/p0-offline-2026-11-11.md)。

## 分层结论

| 层面 | 判定 | 依据／剩余条件 |
|---|---|---|
| 官方公开路径 | 已有文档依据 | [OSS/local SIWC](https://developers.openai.com/siwc/token-sharing-open-source.md)提供动态注册、授权及 public Responses 推理路径 |
| DSH 原生流程 | 隔离 composition 已核对 | 已发布的 `0.2.2-rc.1` 接口可挂载模型、授权和凭据。[宿主快照](dsh-contracts.md) |
| 只改现有 provider 配置 | 当前独立路由不满足 | pi-ai 公开路径发送裸函数及显式 system，拒绝 `models[]`，无法按现有配置满足本项目契约。[抓包结果](../evidence/p0-offline-2026-11-11.md#pi-ai-对照) |
| 专用 Adapter | 已选设计基线 | 自有 route，使用 DSH interface，实现 SIWC 请求转换、错误映射与终态判断 |
| 官方 SDK | `openai@7.55.0` 为候选 transport | 严格类型和合成请求通过。需要独立的协议与终态检查。 [官方 inference 文档](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md) |
| 本项目准入 | 待确认 | P0 只评估本地运行、用户自管凭据的 OSS 候选形态。DSH 官方源码采用 MIT，项目规划包仍是 `UNLICENSED`，最终宿主、收费和发行形态待所有者确认。付费或远程托管按 OpenAI 专门流程确认。 [DSH LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/LICENSE) · [SIWC Overview](https://developers.openai.com/siwc/token-sharing-open-source) |
| 账号／workspace／模型可用 | 待实测 | 登录成功不代表授予直接推理；scope、目录、completed inference 分别验证 |
| 发布／多版本支持 | 未验证 | RC 接口可能变化；当前没有安装、构建或运行证据 |

## 选择与取舍

1. 使用自身真实应用名称和稳定 host ID，走 dynamic registration；不借用 Codex、Hermes 或其他应用身份。
2. 首选专用 `chatgpt-siwc` provider。保留 DSH 的上下文、持久会话、工具执行、审批、沙箱和单次 attempt 重试契约。
3. 最小实现优先选经 P0 核对的官方 SDK 作为 Host 内部传输。保持低层调用与每 attempt 单次发送，在插件内限制请求字段，按 `response.completed` 判定成功。
4. 批准最小实现时复核该 SDK 版本及维护状态。变更版本或改用直接 HTTP/SSE 时复跑相同协议用例。

## P0 硬门槛

- **准入**：确认插件与宿主实际分发／收费／运行形态；为适用 OSS 路线确定许可。条件不明时只做离线测试，不以登录试探代替许可判断。
- **公开契约**：最小 adapter／授权 flow／目录已通过隔离 fixture。产品 Host／Client 注入与加载留待后续阶段。
- **DSH 兼容**：落实主对话、title、compaction、切换和 resume 的支持边界，使用公开路由配置解决强制上限与容量要求。
- **协议**：已核对 SDK 字段传输和终态暴露。后续验证生产 codec 对 namespace、replay、EOF、重复终态和部分工具调用的处理。
- **账号生命周期与 UX**：验证同一注册的登录、refresh 与 logout 世代隔离。确定安全浏览器启动、多个注册切换和 plan 用量 UI 的公开路径。
- **账号验证**：需用户另行授权后，完成一次自身 app 身份登录、目录与最小推理；被平台拒绝则保留原始安全错误分类，不自动改走 backend-api。

P0 不通过时记录具体阻断和下一步；不得把“写好了文档”或“安装成功”升级成“订阅推理已可用”。

## 范围

MVP：单一活动账号／workspace、本地桌面或 CLI 宿主、文本和本地函数工具、流式推理、明确登出；为后续多 profile 保留正确的隔离语义，不在首版提供账号聚合。

不包含：浏览器凭据、账号池／额度轮转、付费远程托管、共享 token、自建 OAuth 中转、backend-api 回退、读取其他应用的登录缓存、OpenAI hosted tools。自托管 VM 有官方专门流程，但不属于首版自动迁移功能。

## 研究边界

官方公开依据见[研究快照](openai-siwc.md)和 [P0 核对](../evidence/p0-offline-2026-11-11.md#openai-公开契约和准入)。本地凭据文件可被同 OS 用户或同进程插件读取。详见[安全设计](../security.md)。
