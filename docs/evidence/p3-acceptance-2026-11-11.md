# P3 离线验收

2026-11-11（Asia/Shanghai）。W1–W6、T1–T4、L1–L4 按文本与本地函数工具的首版范围通过。断网容器从候选包解出 Host 入口，使用发布版 DSH 组件、合成 OAuth 和替身 SSE 执行整套 P3 用例。官方 CLI 使用同一包复核安装准入。

| 验证输入 | 身份 |
|---|---|
| 源码快照 | P2 `30c274cb2e97bab65d61ddfadc872a78357325f9` 上的干净候选 `7ac0b1723edd16c61a3dde7e4f9123333e2c029c`。补记验收文档后，工作区构建产物仍与该候选一致。 |
| 候选包与锁 | `@local/dsh-chatgpt-siwc@0.0.0`，tarball SHA-256 `172f3c4f0a9902eb726a988f6d173f095b7b68dbff74165a4423878ccc114fb3`。依赖锁 SHA-256 `0ec6fd7222f20a0d3a9b5466bb93c9bfca40862862fb934e7666b86c3dba51f6`。 |
| 工程基座 | `v0.1.0-rc.3` 对应 `5178a049eddcf03778125be1db3ae523621f2fc3`。官方 CLI runner SHA-256 为 `b26d16aac46e9a1375d5a733dba8ae2f9c1ff6a8d7aa614f40a891dec7a8f001`。项目原生 runner SHA-256 为 `33c2ebdbd417dd2a12d5a0bcd12eea9d4d44726d8682e7bcfb6d33a71e667b4a`。 |
| 隔离载体 | Linux arm64、Node `24.22.2`、Cordis `4.1.0`、DSH `0.2.2-rc.1`。Node 镜像摘要为 `sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9`，原生测试镜像为 `sha256:d164c731d8d0a18f83ff295cf1abae574a9438d6b834917f939882a1203de401`。官方 npm integrity 见[宿主目标](../../test/p2/host-targets.json)。 |

## 验收矩阵

| ID | 结果 | 观察 |
|---|---|---|
| W1、W2 | pass | 实际 SDK 只发送一次固定端点的 POST。请求使用合成 Bearer、DSH 归因、`store:false`、`stream:true` 和字段白名单。显式温度、上限、stop 和同路由辅助请求提前拒绝。 |
| W3 | pass | DSH 原生压缩引擎经显式配置的独立摘要路由提交 JSONL 检查点。下一次 SIWC 请求按顺序发送 developer 指令、检查点、保留的近期回答与加密推理、新输入。被压缩替换的旧正文和旧加密推理未发送，原日志仍保留。 |
| W4、W5 | pass | EOF、失败、incomplete、畸形 SSE、矛盾文本和未知事件各得到一次失败终态。有效的交错文本及两个工具保持关联和回放顺序，重复完成事件不重复结算。失败流的候选工具未进入执行队列。 |
| W6 | pass | 核对缓存读取、缓存写入、非缓存输入、输出及推理明细。缺失用量不产生零值，带用量的限额失败只结算一次。 |
| T1、T2 | pass | 单个 `dsh` namespace 内多个函数正确逆映射。长名共享前缀时仍有不同 wire 名。未知 namespace、未知名称、重复 call ID 和畸形参数被拒绝。 |
| T3 | pass | Agent 记录工具新增、移除与 deferred schema。发送端使用即时可用声明并保留历史调用和结果。模型再次提出已移除的工具时，适配器拒绝且原生执行次数不增加。 |
| T4 | pass | 原生审批允许后文件写入一次，用户拒绝及只读文件沙箱拒绝均无写入。两种拒绝分别形成可回传的工具错误。 |
| L1 | pass | 两个冻结请求的不同模型同时进入传输并反序完成。模型、上下文、信号和响应保持各自关联。切换账号或重载插件后，旧 prepared call 不会换绑。 |
| L2 | pass | 用户停止、提前关闭迭代器和超时取消 HTTP。Loader 热移除中止活跃 SSE、待返回目录和待返回的 OAuth 刷新。响应体关闭且无第二成功终态，其他 provider 正常，重新挂载后可发起新调用。 |
| L3 | pass | 503 和断流触发宿主记录并重试，每个 attempt 一次 HTTP。已完成工具无重复副作用。额度拒绝不重试。 |
| L4 | pass | 跨进程从原生 JSONL 恢复和派生会话，保留 tool call/result 和加密 reasoning 的顺序。序列化回放用例另核对 assistant phase。未知回放版本及换注册后的加密回放在发送前拒绝。 |

## 复跑与验收边界

[复跑入口](../../test/README.md#p3-隔离宿主验证)记录构建及容器命令。项目 54 项测试、P0 的 5 项隔离回归、lint、类型检查、配置和打包检查通过。断网 Linux 容器复跑其中 26 项 P3 用例，全部通过。容器退出时回收测试凭据、工作区与会话，没有使用个人 profile 或真实账号。

官方 CLI `0.2.2-rc.1` 安装、配置合成和卸载通过。旧版 `0.2.1-rc.4` 按 `engines.dsh` 拒绝，profile 未留下变更。本地 `artifacts/p3-acceptance/<候选包 SHA-256>/` 保存源码 bundle、CLI 报告和原生探针输出。CLI 报告 SHA-256 为 `a6782df82b6e5d2fa7cb992e2f35c5e9ebab64aa07145763c0601affa75ee05c`，原生报告为 `a0534dbb7c500b56b0087af5d0b66b29bb31c0d202ee06edcd30b41d39e48b70`。

P3 离线通过。真实账号及 Web／Desktop 会话行为按 P0 和 P4 的对应入口验收，本轮无真实 request ID 或用量。
