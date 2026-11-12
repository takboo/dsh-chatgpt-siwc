# SIWC 提示缓存 Desktop 复测

2026-11-12（Asia/Shanghai）。W6 用量与缓存对照。官方 macOS ARM64 Desktop `0.2.2-rc.1`，插件提交 `4c0909a`，工程基座锁 `5178a049eddcf03778125be1db3ae523621f2fc3`。原隔离 Desktop profile 中已安装的候选包 SHA-256 为 `abedd40bd20ed9212038dcc922622e38b3f8cf400ccecf674d0deccfe77bb91d`，实测 Host 入口 SHA-256 为 `dbb43f521c9051882dd445892bce8e936ee9b0edb0d0579b7f8b6ab0e857ccad`。从原账号行重新登录，注册数仍为一，核对客户端 ID 和宿主 ID 均复用。

## 公开 SIWC 回包

在隔离 Desktop Host 加载一次性探针，通过原注册的活动授权调用公开 `POST /v1/responses`。用固定 `gpt-6.1-sol`、`reasoning.effort: low`、`store: false`、`stream: true` 和加密推理回放选项，沿用默认缓存设置。前两次使用逐字节相同的请求体，输入由合成清单组成。第三次回放相同输入和上一条回复，再追加用户问题。三次均为 HTTP 200 和 `response.completed`，追加一轮时正确返回首轮合成标记。[SIWC 推理入口](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

| 请求 | 输入 tokens | `cached_tokens` | `cache_write_tokens` |
|---|---:|---:|---:|
| 首次长输入 | 3,775 | 0 | 0 |
| 完全相同的长输入 | 3,775 | 0 | 0 |
| 回放历史并追加消息 | 3,801 | 0 | 0 |

## 原生 Desktop 会话

通过该 Desktop 实例的原生会话接口提交同一新会话的两轮消息，模型和档位均固定为 `gpt-6.1-sol` 和 `low`。首轮提交长输入，第二轮只询问首轮标记。两轮均完成，第二轮正确找回标记。DSH 持久用量分别记录 12,294 和 12,330 个输入 token，两轮缓存读取和写入均为 0。Desktop 窗口显示两轮已完成和 `Cache hit 0%`。

原生会话结果适用于本次工作区、模型、档位和默认缓存设置。通用 Responses 缓存契约和 SIWC 预览限制见[可行性记录](../research/feasibility.md#提示缓存)。

脱敏上游结果 SHA-256 为 `705354f5f416718456b93b961f7c972aba4c8403c33ae59186b5c8b2a73faf57`，原生会话结果为 `98ea6dc4fe4d092d2661346c38a34540e1b432fccb1e5ef205bf7dba4b3d5c62`。已恢复原隔离 Desktop 配置并关闭进程。按本轮用户指示在原隔离 profile 保留可续期登录，凭据及原始测试材料留在仓库外。

## 缓存参数对照

2026-11-12（Asia/Shanghai）。沿用同一 Desktop 版本、候选包、隔离 profile 和仍有效的登录。核对原客户端 ID 和宿主 ID。通过 Desktop Host 临时探针直发公开 SIWC，模型固定 `gpt-6.1-sol`，档位固定 `low`。每组用新的合成前缀避免组间互相预热，组内两次请求体逐字节相同。各组最多发送一个缓存字段，首次返回参数错误后结束该组。[通用 Responses 缓存参数](https://developers.openai.com/api/docs/guides/prompt-caching)

| 参数 | SIWC 结果 | 输入 tokens | 缓存读／写 |
|---|---|---:|---|
| 省略 | 两次 HTTP 200，均 `response.completed` | 每次 3,776 | 两次均 0／0 |
| `prompt_cache_key`，组内固定的合成键 | 两次 HTTP 200，均 `response.completed`。返回的键值与请求值不同 | 每次 3,776 | 两次均 0／0 |
| `prompt_cache_options: {"mode":"implicit"}` | HTTP 400，`invalid_parameter`，`param: prompt_cache_options` | 无用量 | 无用量 |
| `prompt_cache_options: {"ttl":"30m"}` | HTTP 400，同一错误码和字段，错误消息指出不支持 | 无用量 | 无用量 |

此样本中，带 `prompt_cache_key` 的请求能完成，实际缓存读写与对照一致。回包键值不同，服务端如何处理传入键尚未确定。两种 `prompt_cache_options` 请求均在推理前被拒绝。

主对照脱敏结果 SHA-256 为 `8cea2d513db1ee1b712bb8c189df5a577a9051dc1c5705afe3536e602258f503`，TTL 补测结果为 `679837123b06c92175429cb72974dd485f3b14d46b71cfab616725012efbe7c6`。已恢复 Desktop 原配置并关闭隔离实例，原 profile 保留可续期登录。

## `session-id` 请求头对照

2026-11-12（Asia/Shanghai）。沿用同一隔离 Desktop、候选包和有效登录，核对客户端 ID 与宿主 ID 均复用。临时探针在 Desktop Host 内直发公开 SIWC。18 次请求使用逐字节相同的合成长输入和请求体，模型为 `gpt-6.1-sol`，档位为 `low`，每次 3,776 个输入 token。请求体沿用默认缓存设置。唯一对照变量是带连字符的 `session-id` HTTP 头。每组 6 次，逐轮交错发送，轮换各组的发送顺序。固定组复用同一随机 UUID，逐次换值组每次使用新 UUID。

18 次均为 HTTP 200 和 `response.completed`，均返回预期短文本。以下按每组请求次序列出原始用量。

| `session-id` | `cached_tokens` | `cache_write_tokens` | 非零读取 |
|---|---|---|---:|
| 省略 | 0, 0, 0, 3,584, 0, 0 | 0, 0, 0, 0, 0, 0 | 1/6 |
| 固定 | 0, 0, 3,584, 3,584, 3,584, 3,584 | 0, 0, 0, 0, 0, 0 | 4/6 |
| 逐次换值 | 0, 0, 0, 0, 0, 0 | 0, 0, 0, 0, 0, 0 | 0/6 |

固定组自第三次起连续命中。命中请求复用了约 94.9% 的输入。省略组也有一次命中。结果覆盖单一工作区、模型和固定输入；三组共享请求体，服务端可能跨组复用已预热前缀。记录中的 0 是服务端报告的缓存写入用量。

合成请求体 SHA-256 为 `772dce9eac85b3351ef2f0d3147ff98651bc37e229131a4efdca41d81f8d7d7e`，脱敏结果为 `d614fcc0a48aacbdff548e9cf98583828c694739b7b35d506a0a33b1fb80b0e0`。已关闭隔离 Desktop、恢复原配置并确认原 profile 仍有可续期登录。

## Adapter 候选包的原生多轮验收

2026-11-12（Asia/Shanghai），W1、W6。官方 macOS ARM64 Desktop `0.2.2-rc.1`，工程基座锁 `5178a049eddcf03778125be1db3ae523621f2fc3`。用随附 CLI 的 `dsh plugin --profile desktop add <候选包>` 安装在原隔离 profile。直接复用有效登录，核对客户端 ID 与宿主 ID 一致。

| 复测输入 | SHA-256 |
|---|---|
| 源码基线 `4c0909a` 上的 `git diff -- src` | `225a96b1907cb437da1294dd4a05d0b9e6b0b10999c274cf48a8d405ab22a51c` |
| 候选包 | `19469e42878cb970e7043a36bbb39a457259376155e2a10d45f3026f307aa467` |
| 已安装 Host 入口 | `96dac4263d9b4c80c820f50dca403d6cc2f80f2243411b93bc23813412342cf1` |
| `package-lock.json` | `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6` |
| 脱敏会话用量 | `3109770a46af9d96a97d83e5245cbe56791af536629347642c7ecc7cb9e7b535` |

通过原生 Desktop 会话接口，在同一标准模式会话固定选择 `gpt-6.1-sol`、`low`。第一轮发送一份合成清单，后五轮依次询问清单中的不同字段。六轮均为 `completed`，每轮文本均符合预期。取证脚本在第二轮完成后改为读取 DSH 会话沿用的请求配置，从第三轮继续同一会话。前两轮从持久记录回读。

| 轮次 | 输入 tokens | 缓存读取 | 缓存写入 |
|---:|---:|---:|---:|
| 1 | 11,167 | 0 | 0 |
| 2 | 11,199 | 11,008 | 0 |
| 3 | 11,237 | 11,008 | 0 |
| 4 | 11,269 | 11,136 | 0 |
| 5 | 11,303 | 0 | 0 |
| 6 | 11,335 | 11,136 | 0 |

用量来自实际会话的 `assistant/message`。5 轮续聊有 4 轮命中，合计缓存读取 44,288，输入 67,510，比例 65.6%。原生窗口显示 `6 turns 6 steps` 和 `Cache hit 66%`。单轮命中取决于服务端。

`npm test` 通过 71 项，lint、类型检查、打包通过。请求回归核对同一会话刷新令牌和切回原账号后复用头值，不同注册或会话分开，独立请求省略头，请求体保持原形。[回归用例](../../test/p3/responses.test.mjs)

关闭隔离 Desktop 后恢复本轮临时配置，候选包及可续期登录保留在原隔离 profile。
