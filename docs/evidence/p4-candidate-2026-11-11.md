# P4 隔离联机候选

2026-11-11（Asia/Shanghai）。Web 和官方 macOS Desktop 使用同一个从干净源码快照构建的候选包。真实账号验收待单独授权。

| 输入 | 已核对身份 |
|---|---|
| 源码 | P3 `94346fa5e6063d7c77527209ac0b08a1d601e0cf` 加 P4 工作区变更，临时干净快照 `056a1ca64234b257cf1dabd82badcf35cadbc333`。 |
| 候选包 | `@local/dsh-chatgpt-siwc@0.0.0`，SHA-256 `0de932fe5491506e31616e090e8fb0564e3bff043138581373a0b90489bbf328`。依赖锁 SHA-256 `34ca18f8076211f7ac91418bbea33452b7024bc15d4a08d617b6e1229d9192e6`。 |
| 基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3`。Linux Web 与 Tart runner 从锁定提交导出。 |
| Web | Linux arm64、DSH `0.2.2-rc.1`、Node `24.22.2`、Playwright `1.56.1`、Chromium `141.0.7390.37`。 |
| Desktop | `shared-tart`，macOS `15.7.7` (`24G720`)，arm64，Tart `2.41.1`。官方签名 `com.deepseek.dsh` `0.2.2-rc.1`，团队 `NAN929V4UM`。内置 Node `24.21.0`、Chromium `152.0.7977.130`。 |

| 场景 | 结果 | 观察 |
|---|---|---|
| 默认 profile | pass | 实际 Web 与 Desktop 安装后显示离线状态。Web 卸载通过，`0.2.1-rc.4` 按预期拒绝。 |
| Web 显式开启与回环交接 | pass | 只在测试 profile 应用 `enableLiveOAuth: true`。登录按钮调用真实 Host 启动逻辑。替身 `xdg-open` 验证仅收到一次性回环地址，环境中无 DSH 变量和凭据 canary。Host 只重定向一次，取消后回环监听器关闭，账号列表仍为空。 |
| Desktop 显式开启和系统浏览器 | pass | 签名应用通过图形管理器安装同一 tarball。修正探针对空 YAML 列表的写法后，来宾 `dsh-job-20261111T074103-88209` 重启显示登录入口，实际打开 Safari，取消后回到未登录状态。该来宾使用仅宿主网络，验证后已回收。 |
| 无凭据联机预检 | pass | 来宾 `dsh-p4-live-net-20261111T075024-91754` 中的 Safari 成功访问官方公开 discovery。装入同一包的 Web Host 和签名 Desktop Host 分别从 `/v1/models` 收到预期的无凭据 `401`。三个 TCP 握手均在本机 Clash TUN 上匹配，来宾和临时代理均已回收。 |
| 合成授权与回归 | pass | 干净快照的 lint、类型检查、56 项项目测试、配置合成和打包检查通过。同一包另在断网容器通过 26 项 P3 回归。 |
| 真实账号、目录与推理 | not-run | 尚未登录或交换真实授权，真实浏览器授权回调、账号资格、模型目录、推理及 U1、R1–R3 仍待验。 |

## 预检出网

仅宿主网络来宾通过限源 CONNECT 代理访问两个固定公开目标。宿主的 DoH 查询经 Clash TUN，代理也将上游 socket 绑定到该接口。Safari 使用来宾系统代理，Web 与 Desktop Host 使用来宾回环转发，回环地址留在代理绕过列表。Host 直连网桥代理曾返回 `EHOSTUNREACH`，经回环转发后两个 Host 均通过。抓包只匹配三个请求的 TCP 握手元数据。登录页实际导航和身份提供方的额外依赖留待授权后的验证。[DoH 接口](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/)

本机 `artifacts/p4-candidate/<候选包 SHA-256>/` 保留 tarball、源码 bundle、探针和脱敏报告。Web 默认报告 SHA-256 为 `738f6d4710992f35d988bb389eb0f75ea3d91b28d533328ccff9ef603ea67298`，显式开启报告为 `af62c2cb316318da57cb3d411737d46393ba471bd1df1a3ec9ac9bd4ec2cb93e`。Desktop 输出为 `f8e9da8af67ba29cb8ef345587c977d8507a905fdecf877c58b91ba4e1de7949`，联机摘要为 `4c02b18d84b3572d76fb4c01f4fef13f34980078ae549454bb3674ce87d1493e`。工作区重打包的文件内容相同，README 文件权限使归档摘要不同，宿主验收以干净快照的候选包为准。[复跑入口](../../test/README.md#p4-交互验收)
