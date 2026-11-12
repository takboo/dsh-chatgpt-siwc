# SIWC 推理档位实测

## 接入前的协议探针

2026-11-12（Asia/Shanghai）。在官方 macOS ARM64 Desktop `0.2.2-rc.1` 的隔离 profile 中，使用原注册重新授权。核对注册数仍为一，复用了原 client ID 和 host ID。已安装的 SIWC Host 入口来自 [默认配置切换复测](default-model-switch-2026-11-12.md) 的同一候选包。仓库基线为 `0976f14`，工程基座锁为 `5178a049eddcf03778125be1db3ae523621f2fc3`。

临时探针在 Desktop Host 内读取当前有效的订阅 access token，向公开 SIWC `POST /v1/responses` 发送 `gpt-6.1-sol` 请求。使用顶层 `reasoning.effort`、`store: false`、`stream: true` 和 `include: ["reasoning.encrypted_content"]`。每项只发一次。记录脱敏状态、终态、服务端回显的档位和用量。 [官方推理入口](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

| 用例 | HTTP／终态 | 回显档位 | 推理 tokens |
|---|---|---|---:|
| 独立短请求 | 200／`response.completed` | `low` | 0 |
| 独立短请求 | 200／`response.completed` | `medium` | 0 |
| 独立短请求 | 200／`response.completed` | `high` | 0 |
| 独立短请求 | 200／`response.completed` | `xhigh` | 12 |
| 独立短请求 | 200／`response.completed` | `max` | 16 |
| 续聊首轮 | 200／`response.completed` | `high` | 9 |
| 续聊第二轮 | 200／`response.completed` | `max` | 0 |

五个独立请求均得到预期短文本。续聊第二轮以完整历史发送原用户消息、一条加密推理项、一条助手回复和新问题。第二轮正确回答首轮中的测试标记。两轮仅用请求顶层选档，省略 `previous_response_id` 和 `configuration_update`。

协议探针覆盖一个订阅工作区、一个模型和直接 HTTP 请求。用量为本轮样本，不能据此推断档位之间的稳定成本或时延差异。脱敏结果 SHA-256 为 `7b1d02722c3d82758d585af90a4cd5ce8427ff6c47de7879e5572fa1c1ad086a`，探针脚本 SHA-256 为 `a6d859f260df4ea03c7be4100452a05eeed4571a3f9f65cc3f9f34b8ed357eb6`。

探针结束后关闭隔离 Desktop，恢复 profile 的原补丁，并按当时的授权保留登录状态供下述复测。

## W2 候选包的 Desktop 原生选档和续聊

2026-11-12（Asia/Shanghai）通过。官方 macOS ARM64 Desktop `0.2.2-rc.1`，工程基座锁 `5178a049eddcf03778125be1db3ae523621f2fc3`。候选包由 `0976f14` 加本次工作树的 adapter 改动构建，`git diff -- src` 的 SHA-256 为 `9ae0c5211e04e860d76d283baed6f0a6554e17807ddaa0da0a100ed4c8f695ba`。用 `dsh plugin --profile desktop add <候选包>` 安装到原隔离 profile，直接复用当时已登录的账号、注册和 host ID。

| 校验项 | SHA-256 |
|---|---|
| `local-dsh-chatgpt-siwc-0.0.0.tgz` | `abedd40bd20ed9212038dcc922622e38b3f8cf400ccecf674d0deccfe77bb91d` |
| 已安装 Host 入口 | `dbb43f521c9051882dd445892bce8e936ee9b0edb0d0579b7f8b6ab0e857ccad` |
| `package-lock.json` | `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6` |
| 脱敏会话结果 | `9ec5311496d5f7979a964a92b6a7b42e9fb2c1256fe0c3eb76c5abfc39c542f7` |

1. 在隔离 Desktop 的标准模式会话选择 `gpt-6.1-sol`。原生目录返回五档，省略 `defaultEffort`。窗口的 Effort 菜单显示 `Default`、`Low`、`Medium`、`High`、`Extra High` 和 `Max`。用户在同一窗口手动选择 `High`，再选回 `Max`，界面回读确认了最终选择。
2. 真实续聊通过该 Desktop 实例的 `session/selectModel` 和 `session/prompt` 发起。第一轮用 `high` 保存合成标记，第二轮在同一会话切到 `max`，仅询问原标记。持久记录的两个 request header 依次为 `high` 和 `max`，两轮均为 `completed`，第二轮正确找回标记。两条回复也在原生窗口中核对。
3. `npm test` 通过 70 项，lint、类型检查和打包通过。[原生 Agent 回归](../../test/p3/native-projection.test.mjs)核对 `high`、`max` 和提供方默认对应的出站请求，验证续聊带回加密推理历史，也验证未知档位在发起推理前被拒绝。
4. 结束时退出隔离 profile 中的账号，远端撤销返回 `confirmed`。回读本地账号为 `signedOut` 且已清除 token，原注册和 host ID 仍在。已关闭隔离 Desktop 实例并确认其本地监听关闭。

本轮真实候选包复测限 Desktop 上的 `gpt-6.1-sol`。凭据、原始回包和测试历史保留在仓库之外。
