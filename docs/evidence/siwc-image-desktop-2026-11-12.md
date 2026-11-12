# SIWC 用户图片 Desktop 复测

2026-11-12（Asia/Shanghai），W3 通过。官方签名的 macOS ARM64 Desktop `0.2.2-rc.1`，macOS `27.2`（`26B123`），随附 Electron Node `24.21.0`。沿用原隔离 `DSH_HOME`、`desktop` profile、独立 Electron 用户数据目录及现有登录。工程基座锁为 `5178a049eddcf03778125be1db3ae523621f2fc3`。

## 候选包和入口

| 项目 | 实测值 |
|---|---|
| 源码 | `f8479cd8cc08077b444dd08495cffaf2917779f1` 加本轮 adapter 改动，`git diff -- src` SHA-256 `12898d54742414671f5c34ceba657589e677e0ab1e8ddff0a6772c56ecfc1ef2` |
| 构建 | Node `26.13.0`、npm `11.20.0`，锁文件 SHA-256 `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6` |
| 候选包 | `@local/dsh-chatgpt-siwc@0.0.0`，SHA-256 `bbe00d79f9273bf5c59452f45836d00aa97aaa27d03bf7f46476064c4c785982` |
| 安装 | 官方随附 CLI 执行 `dsh plugin --profile desktop add <候选包>`。已安装 Host 入口与包内文件一致，SHA-256 `82a51b9faee7ab3ece70b41e88bf6de7f5f0325a01a036393be493a9e1027084` |
| 会话入口 | 隔离 Desktop 的本机原生 `session/selectModel`、`session/prompt` 和 `session/events`。锁定版的前端 `session/modelCatalog` 不投影图片能力，使用真实提交和完成事件验收图片准入。 |

## 两轮结果

在同一标准会话中固定 `gpt-6.1-sol` 和 `low`。使用一张 880 × 200 的合成 PNG，左右各有一个独立生成的八字符标记。两个标记只写进图片。PNG 大小为 19,841 字节，SHA-256 为 `c808ee2db184255fe19af8e2e7b986317713d1a62f657def78010fb6505b8a51`。

| 轮次 | 提交 | 结果 |
|---|---|---|
| 1 | 提交 PNG，只问左侧标记 | `completed`，回复精确匹配左侧标记，未带出右侧标记 |
| 2 | 同会话只发文字，追问右侧标记 | `completed`，回复精确匹配右侧标记 |

两个请求头均确认模型和档位。会话中只有一个持久图片引用，无内联 Base64，无工具调用。真实推理覆盖上述代表模型，图形界面的附件按钮和其他模型留在本轮范围之外。[SIWC 图片与 HTTP 历史约束](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations#responses-api-requirements)

## 回归与结束状态

- `npm test` 通过 74 项，lint、类型检查和打包检查通过。离线回归覆盖目录与宿主能力门控、图文顺序、持久引用及同会话回放、工具图片占位、图片超预算和附件读取失败不发起推理。[原生会话测试](../../test/p3/native-projection.test.mjs) · [请求协议测试](../../test/p3/responses.test.mjs)
- 脱敏探针结果 SHA-256 为 `ddc10da0e9c91d96a84d7f4034d81c7689eba6170497ae55ff349fbe8d4c2ba4`。原始日志、图片和测试会话留在仓库外。
- 本轮沿用已有授权，未发起新注册或重新登录。账号仍为 `connected`，原隔离 profile 保留可续期登录及候选包。已关闭隔离 Desktop，确认本机监听关闭，并还原本轮引起的默认档位变化及安装用临时配置。
