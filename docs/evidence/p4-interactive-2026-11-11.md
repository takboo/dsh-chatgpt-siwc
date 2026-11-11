# P4 交互环境首轮验证

2026-11-11（Asia/Shanghai）。双宿主复跑使用 P3 提交 `94346fa5e6063d7c77527209ac0b08a1d601e0cf` 的默认离线包。另用专用来宾执行无凭据联网预检。真实账号及实际授权步骤留待单独验收。

| 输入 | 已核对身份 |
|---|---|
| 基座 | `v0.1.0-rc.3`，`5178a049eddcf03778125be1db3ae523621f2fc3`。按锁定版 Web runner 和本仓库的交互流程复跑。 |
| 候选包 | `@local/dsh-chatgpt-siwc@0.0.0`，SHA-256 `172f3c4f0a9902eb726a988f6d173f095b7b68dbff74165a4423878ccc114fb3`。依赖锁 SHA-256 `0ec6fd7222f20a0d3a9b5466bb93c9bfca40862862fb934e7666b86c3dba51f6`。 |
| Web | Linux arm64，Node `24.22.2`，DSH `0.2.2-rc.1`，Playwright `1.56.1`，Chromium `141.0.7390.37`。固定浏览器镜像 `sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a`。 |
| Desktop | `shared-tart`，来宾 `dsh-p4-20261111T064706-77950`，macOS `15.7.7` (`24G720`)，arm64，Tart `2.41.1`。基线镜像 `sha256:eee659985b01e4df2a6c0754bd8d25e54969933c43fdcd4edef8bea337b3d354`。签名 `com.deepseek.dsh` `0.2.2-rc.1`，团队 `NAN929V4UM`，内置 Node `24.21.0`、Chromium `152.0.7977.130`。 |

| 场景 | 结果 | 观察 |
|---|---|---|
| Web 离线安装、设置和卸载 | pass | `run-container.sh all` 在独立 Linux profile 装入同一包。固定 Chromium 打开插件详情，通过 owner Typert 读取离线状态。卸载通过；`0.2.1-rc.4` 按预期拒绝。 |
| Desktop 离线安装、设置和重启 | pass | 在有窗口的 Tart 来宾中调用 `test/p2/desktop-guest.sh`。严格校验官方签名和输入摘要，经图形管理器安装并启用。验证 profile 指向同一 tarball、详情设置和重启恢复。 |
| 来宾隔离 | pass | 使用 `--net-host`，关闭音频、剪贴板和 USB，共享输入卷的写入探针被拒绝。Desktop 使用本轮独立应用数据、`HOME` 和 `DSH_HOME`。 |
| Codex 接入同一 Tart 窗口 | pass | Computer Use 观察到来宾启动和桌面，通过窗口坐标打开来宾 Safari 并送入按键。带修饰符的字符在来宾地址栏出现偏差，部分坐标操作返回 `noWindowsAvailable`。 |
| 用户接手并交回 | pass | 用户在来宾内打开本地演练页并留下 `USER_OK`。Codex 在同一 Tart 窗口确认标记，点击接回后目视核对 `HANDOFF_COMPLETE`。 |
| 来宾通过限定中继经 Clash TUN 访问公开端点 | pass | 仅宿主网络来宾通过临时 TCP 中继访问两个固定目标。授权 discovery 返回 `200`，无凭据访问模型目录返回 `401`。两次 TLS 证书校验均通过，且在 TUN 上匹配到各自的 TCP SYN。 |
| 正式联机 profile 的出网路径 | not-run | 中继探针以宿主预解析地址连接。后续对 DNS、Safari 和两个 Host 的结果见[联机候选证据](p4-candidate-2026-11-11.md#预检出网)。 |
| L5、B1、U1、R1–R3 完整验收 | not-run | 默认离线包的设置入口可用。真实授权、模型选择和会话、辅助路由、共存及账号生命周期尚待实测，无真实 request ID 或用量。 |
| 来宾回收 | pass | 停止后由启动器删除本轮克隆。复查来宾已移除、`desktop-job.lock` 已释放，锁定基线仍在。 |

[交互与复跑入口](../../test/README.md#p4-交互验收)。本机 `artifacts/p4-interactive/<候选包 SHA-256>/` 保存无凭据演练页及脱敏探针报告。Web 报告 SHA-256 为 `04308b3ba0d72ff7dc054cbb24655d53466c0f3612a8628d080318abf6414de8`，Desktop 输出为 `7467ee895b586ea2fca246c111d2e19f3e148a3f2b18d0c52837c825d794f784`，Desktop 输入清单为 `32885854c35f5bc7ef99f2d393d1d29bc0569c9ad961e2f8757bc24c3b0330c1`。

## 联网预检

Softnet 启动因缺少所需的免密提权而退出。后续保持 `--net-host`，在宿主用临时 TCP 中继接收指定来宾的连接，出站 socket 绑定 Clash TUN。来宾使用 `curl --connect-to` 保留 HTTPS 主机名和 TLS 校验，两个目标分次通过。临时中继的就绪检查偶发超时。探针只采集匹配的握手元数据，未使用账号或令牌。每个探针来宾均已删除，共享基线仍在且实验室锁已释放。脱敏摘要 `tun-probe-summary.log` 的 SHA-256 为 `5b8b71f6a32dc3d82a97cc347b9658e71250d4c0e10e95b650d156f9bac33d22`。
