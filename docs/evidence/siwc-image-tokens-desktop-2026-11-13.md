# SIWC 多图用量与默认压缩阈值复测

2026-11-13（Asia/Shanghai）。W3、W6、L5。真实 Desktop 完成 6 次用量对照和 3 轮同会话续聊。普通续聊未达到压缩阈值。离线使用默认阈值复跑，在没有实测用量锚点的临界历史中，图片估算差异改变了是否触发压缩。

使用原隔离 Desktop profile 和既有 SIWC 注册，运行归档的官方签名 macOS ARM64 Desktop `0.2.2-rc.1`，系统为 macOS `27.2`（`26B123`）。基座锁 `5178a049eddcf03778125be1db3ae523621f2fc3`，仓库 HEAD `c1ed5112f6c320edf627832ec18bf5cf859d66b5`。已安装包沿用图片验收的 `bbe00d79f9273bf5c59452f45836d00aa97aaa27d03bf7f46476064c4c785982`，实测 Host 入口 SHA-256 为 `82a51b9faee7ab3ece70b41e88bf6de7f5f0325a01a036393be493a9e1027084`。[签名应用来源](p2-host-2026-11-11.md) · [候选包记录](siwc-image-desktop-2026-11-12.md)

## Desktop 图片输入用量

临时 Host 探针把合成 PNG 存入 DSH 原生附件服务，用 adapter 的 `imageRequestTarget` 取得出站版本。对公开 `/v1/responses` 逐次发送独立请求，固定 `gpt-6.1-sol`、`low`、`detail: "auto"` 和同一个 `input_text` 数组。请求无工具声明。6 次均为 HTTP 200、`response.completed`，输出均为 5 token，缓存读写均为 0。表中 DSH 增量按同一附件引用的原生结构估算，SIWC 增量用原始 `input_tokens` 减去纯文字的 18。[估算源码](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/token-meter/src/estimate.ts#L12-L34)

| 出站图片 | Base64 字节 | SIWC 输入 | SIWC 图片增量 | DSH 引用估算增量 | 少估 |
|---|---:|---:|---:|---:|---:|
| 纯文字 | 0 | 18 | 0 | 0 | 0 |
| 1 张 256 × 256 | 1,040 | 95 | 77 | 54 | 23 |
| 1 张 1,536 × 1,536 | 13,968 | 2,783 | 2,765 | 55 | 2,710 |
| 1 张 1,536 × 768 | 7,060 | 1,401 | 1,383 | 55 | 1,328 |
| 4 张 1,536 × 1,536 | 55,884 | 11,078 | 11,060 | 222 | 10,838 |
| 上述三种尺寸各 1 张 | 22,068 | 4,243 | 4,225 | 164 | 4,061 |

本组多图增量与单图增量之和完全一致。单图的观测值也符合 32 像素 patch 计数乘以 1.2 后向上取整。这是三个尺寸上的吻合，`gpt-6.1-sol` 的 `auto` 缩放规则和其他模型仍需独立验证。[OpenAI 图像 token 规则](https://developers.openai.com/api/docs/guides/images-vision#patch-based-image-tokenization)

## Desktop 同会话续聊

通过 Desktop 原生会话入口提交三轮。宿主探针在 `agent/pre-step` 读取已经入账的会话，并在 assistant stream 开始前读取更新后的历史。SIWC 输入用量由 DSH 已提交的互斥输入桶重组，等于 `inputTokens + cacheReadTokens + cacheWriteTokens`。输出每轮均为 5。三轮均 `completed`，无工具调用、图片卸载或压缩事件。

| 轮次 | 新附图 | 压力检查时历史图数 | 压力检查值和基线 | 发请求前的 DSH 估算 | SIWC 输入 | 其中缓存读取 |
|---|---:|---:|---|---:|---:|---:|
| 1 纯文字 | 0 | 0 | 0，无基线 | 10,429 | 8,431 | 0 |
| 2 附四张大图 | 4 | 0 | 10,439，估算 | 10,685 | 19,514 | 8,320 |
| 3 纯文字续聊 | 0 | 4 | 19,519，实测用量 | 19,543 | 19,537 | 18,944 |

第 2 轮的 4 张图在压力检查后才入账，估算随后增加 246，其中包括图片引用和本轮文字。第 3 轮的压力检查使用第 2 轮实测输入 19,514 加输出 5。请求前估算与第 3 轮实测输入只差 6。切模型和图片卸载未在这组三轮中触发。[DSH 计量和锚点](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/token-meter/src/index.ts#L151-L195)

## 离线默认阈值复跑

复用项目 P3 原生 fixture，运行 `0.2.2-rc.1` 的 `TokenMeter` 和 `BasicCompaction`。SIWC transport 回放上表用量及缓存桶，摘要由本地合成 provider 返回。窗口固定为目录的 500,000，`thresholdRatio = 0.8`，`headroomTokens = 65,536`，请求输出预留为 0。默认压力阈值为 400,000。对照只在测试进程内通过原生 `imageRequestPricing` 提供四张同尺寸图的实测增量。线上 adapter 未参与这项校准。[原生 fixture](../../test/p3/native-host.mjs) · [DSH 阈值计算](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/compaction/compaction-basic/src/config.ts#L172-L195)

| 离线历史 | 现有估算 | 实测图片增量校准 | 提交压缩摘要 |
|---|---:|---:|---|
| 原三轮，含实测用量锚点 | 19,519 | 19,519 | 两组均未触发 |
| 补长历史，有用量锚点且达到阈值 | 400,000 | 400,000 | 两组均在第 7 轮触发 |
| 补长历史，无用量锚点，低于阈值 1 | 389,161 | 399,999 | 两组均未触发 |
| 补长历史，无用量锚点，等于阈值 | 389,162 | 400,000 | 校准组在第 7 轮触发 |
| 补长历史，无用量锚点，高于阈值 1 | 389,163 | 400,001 | 校准组在第 7 轮触发 |

临界组使用四轮合成长文本把同一批多图历史推近默认阈值。真实 Desktop 的三轮负载距阈值仍有 380,481 token。离线结果确认无锚点时可能改变默认阈值判定，出现频率和其他尺寸组合的准确性尚待验证。

Desktop 已关闭并恢复原 profile 配置。原账号仍为 `connected`，可续期授权保留，注册数为一。临时探针、合成图片和会话留在仓库外。脱敏结果 SHA-256 分别为 `97166112f10243926ccf79c880819b44d26a909954f2b006d6a6b00099200a35`（独立请求）、`20ad107815c3f5e3f482de992f3fd6785e66d160e1e9dd8db251cbaff003279a`（续聊）、`7f43ceae7e1f48ac0a06c11956d4b9541b2f58d13ea2e11fd178040c83b49f43`（宿主估算）、`f488c39c640f557e30aadda5822aac41507cf4ead8fd4c0a316aeeedcce24556`（离线复跑）。
