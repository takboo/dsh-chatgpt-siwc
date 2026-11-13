# SIWC 托管搜索 Desktop 复测

2026-11-13（Asia/Shanghai），R1 目录、W1 与 W4 协议探针。公开 SIWC 的模型目录、托管搜索、流式引用和同会话续聊通过。结果来自 Desktop Host 内的临时探针。

| 项目 | 环境 |
|---|---|
| 宿主 | 官方签名 macOS ARM64 Desktop `0.2.2-rc.1`，macOS `27.2`（`26B123`）。使用此前验签的[应用归档](p2-host-2026-11-11.md)，启动前再次验证应用签名 |
| 基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3`，从该提交读取接入指南 |
| 插件 | `b399f142e0400e505961db4cad557d726f4dc4f1`，工作区已有研究文档差异。沿用[流式摘要验收](siwc-reasoning-summary-desktop-2026-11-13.md#流式摘要候选包验收)安装的 `@local/dsh-chatgpt-siwc@0.0.0`。包 SHA-256 `52975bdde0d1a2b57c6eefe4b7424599b961046423e63de55634df53492f78e7`，实读 Host 入口 SHA-256 `5cc8bab13fc27252a80ec820c19b0073840989da2f991cf1ff143b2d70dccc1c` |
| 入口 | 原隔离 `desktop` profile，以临时 Cordis 补丁挂载探针。先通过设置 `reload` 使用现有授权，再触发探针。请求走公开 `api.openai.com/v1` |

## 目录与请求

`GET /v1/models` 返回 HTTP 200。10 条均明确声明 `supports_search_tool: true` 和 `web_search_tool_type: "text_and_image"`，其中 8 条可见。选择可见的 `gpt-6.1-sol`，两轮固定 `low`。本轮检验文字搜索和文字引用。

首轮参照 Magpie 的公开 SIWC 兼容层与合成回归，发送顶层 `tools: [{"type":"web_search"}]`、`tool_choice: "auto"`、`stream: true`、`store: false`。提示词要求搜索 RFC 9110 §15.5.5、给出状态码与引用，并原样复述一个会话标记。追问要求从首轮回答取回状态码和标记。续聊使用同一个随机 `session-id`，按顺序发送首轮用户消息、流中两个已完成的搜索项、包含引用的助手正文和追问。第二轮省略 `tools` 与 `tool_choice`，两轮均省略 `previous_response_id`。[Magpie 请求回归](https://github.com/yetone/magpie/blob/36eebea13675cfafbb79de573f533ed0e7b8f4af/internal/provider/chatgpt_api_test.go#L349-L381) · [公开 SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations#responses-api-requirements)

## 实际结果

| 轮次 | HTTP 与终态 | 搜索 | 引用 | 验证 |
|---|---|---|---|---|
| 首轮 | `200`、`response.completed`，`output: []` | 两个 `web_search_call`，`search` 和 `open_page`，均收到 `response.web_search_call.completed` 与 `response.output_item.done` | `response.output_text.annotation.added` 收到 1 条 `url_citation`，流事件指向官方 RFC 的 HTTPS 页面，已完成的助手消息也含 1 条引用 | 正确答出 `404 Not Found`，并复述会话标记 |
| 同会话续聊 | `200`、`response.completed`，终态有 1 条助手消息 | 无新搜索调用 | 无新引用 | 正确返回 `404` 和首轮会话标记 |

两次首轮请求都收到两项已完成的搜索、一条引用，以及 `output: []` 的成功终态。首次探针只从终态提取正文，所以当轮未发追问。复跑改用按 `output_index` 收集的 `response.output_item.done`，在 `response.completed` 后提交下一轮历史。此次结果说明只读取终态 `output` 会漏掉搜索、引用和回放所需的正文。是否将引用渲染为 DSH 可点击链接需另行验收。[Responses 搜索与引用](https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations)

脱敏报告 SHA-256，首轮为 `ece7240d93b4071d2162e92de95490b819cc70f9c73dde07b1b49bf6c625ad5e`，完整续聊复跑为 `09c72f260bbc2b6adb9d0b2f8eefe33ba60594ef0eda0c597ce343436a761b35`。复测期间账号、注册和凭据世代均保持一致。结束时确认 `connected`，保留可续期授权，关闭隔离 Desktop，并逐字节核对原 profile 补丁已恢复。
