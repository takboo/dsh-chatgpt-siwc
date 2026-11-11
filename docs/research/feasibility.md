# 可行性结论与复用决策

2026-11-11 更新。**DSH 公开 Host 接口支持独立 provider 接入。P2 离线包已验证实际 Web 与签名 macOS Desktop，P3 合成推理已通过隔离验收。真实账号推理仍待实测。** [P0 证据](../evidence/p0-offline-2026-11-11.md) · [P3 验收](../evidence/p3-acceptance-2026-11-11.md)

## 分层结论

| 层面 | 判定 | 依据／剩余条件 |
|---|---|---|
| 官方公开路径 | 已有文档依据 | [OSS/local SIWC](https://developers.openai.com/siwc/token-sharing-open-source.md)提供动态注册、授权及 public Responses 推理路径 |
| DSH 原生流程 | 隔离 composition 已核对 | 已发布的 `0.2.2-rc.1` 接口可挂载模型、授权和凭据。[宿主快照](dsh-contracts.md) |
| 只改现有 provider 配置 | 当前独立路由不满足 | pi-ai 公开路径发送裸函数及显式 system，拒绝 `models[]`，无法按现有配置满足本项目契约。[抓包结果](../evidence/p0-offline-2026-11-11.md#pi-ai-对照) |
| 专用 Adapter | 已选设计基线 | 自有 route，使用 DSH interface，实现 SIWC 请求转换、错误映射与终态判断 |
| 官方 SDK | P3 Host 固定 `openai@7.55.0` | 官方预览要求 `store:false`、`stream:true` 和 namespaced functions。合成测试捕获实际 SDK 请求，确认固定端点、单次发送、关闭重试及终态处理。真实工作区的模型与字段支持待验。 [官方推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) · [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) · [P3 证据](../evidence/p3-offline-2026-11-11.md) |
| 本项目准入 | 选定 OSS／本地路径 | 项目采用 MIT。插件免费，用户在本机 Web 或官方 Desktop 自管账号和凭据。真实注册、工作区推理权限和配额待实测。[许可证](../../LICENSE) · [SIWC Overview](https://developers.openai.com/siwc/token-sharing-open-source) |
| 账号／workspace／模型可用 | 待实测 | 登录成功不代表授予直接推理；scope、目录、completed inference 分别验证 |
| 发布／多版本支持 | 未验证 | 已有 P2 单个目标版本的离线宿主证据。发布和 P3 实际宿主行为仍待验证。 [P2 双宿主证据](../evidence/p2-host-2026-11-11.md) |

## 选择与取舍

1. 使用自身真实应用名称和稳定 host ID，走 dynamic registration；不借用 Codex、Hermes 或其他应用身份。
2. 首选专用 `chatgpt-siwc` provider。保留 DSH 的上下文、持久会话、工具执行、审批、沙箱和单次 attempt 重试契约。
3. 最小实现优先选经 P0 核对的官方 SDK 作为 Host 内部传输。保持低层调用与每 attempt 单次发送，在插件内限制请求字段，按 `response.completed` 判定成功。
4. 批准最小实现时复核该 SDK 版本及维护状态。变更版本或改用直接 HTTP/SSE 时复跑相同协议用例。

## P0 硬门槛

- **准入**：MIT 和本地免费形态已确定。该决定用于离线实施，实际账号与工作区资格见最小账号验证。
- **公开契约**：最小 adapter／授权 flow／目录已通过隔离 fixture。产品 Host／Client 注入与加载留待后续阶段。
- **DSH 兼容**：落实主对话、title、compaction、切换和 resume 的支持边界，使用公开路由配置解决强制上限与容量要求。
- **协议**：已核对 SDK 字段传输和终态暴露。后续验证生产 codec 对 namespace、replay、EOF、重复终态和部分工具调用的处理。
- **账号生命周期与 UX**：验证同一注册的登录、refresh 与 logout 世代隔离。确定安全浏览器启动、多个注册切换和 plan 用量 UI 的公开路径。
- **账号验证**：需用户另行授权后，完成一次自身 app 身份登录、目录与最小推理；被平台拒绝则保留原始安全错误分类，不自动改走 backend-api。

P0 不通过时记录具体阻断和下一步；不得把“写好了文档”或“安装成功”升级成“订阅推理已可用”。

## 范围

MVP 为本地 Web 和官方 Desktop、多个可保存注册与每个 profile 一个活动账号／workspace、文本和本地函数工具、流式推理、明确登出。其他宿主载体另行验证。

不包含：浏览器凭据、账号池／额度轮转、付费远程托管、共享 token、自建 OAuth 中转、backend-api 回退、读取其他应用的登录缓存、OpenAI hosted tools。自托管 VM 有官方专门流程，但不属于首版自动迁移功能。

## 研究边界

官方公开依据见[研究快照](openai-siwc.md)和 [P0 核对](../evidence/p0-offline-2026-11-11.md#openai-公开契约和准入)。本地凭据文件可被同 OS 用户或同进程插件读取。详见[安全设计](../security.md)。
