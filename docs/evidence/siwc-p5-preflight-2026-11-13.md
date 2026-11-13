# P5 私有候选预检

2026-11-13（Asia/Shanghai）。候选包由本地源码构建，用于发布准备和隔离验证。

| 项目 | 结果 |
|---|---|
| 源码 | `bc53be9094f45806424bf07e8d716e5aadeba889`，锁文件 SHA-256 `fd37ca08de2ed2b79307e92b3fe56ddec834d716b37fc0a5c94ae9d9caf720c6` |
| 包 | 私有 `@local/dsh-chatgpt-siwc@0.0.0`，`engines.dsh` 为 `0.2.2-rc.1`。tarball SHA-256 `cdc4538a7a7bbf64533043746d98713659a329bbe4e64d62ed684437ee79055b` |
| 构建与分发文件 | Node `26.13.0`、npm `11.20.0`。干净依赖安装、lint、typecheck、77 项自动化、固定 Chromium 合成界面回归及 pack 通过。包内清单、双语元数据、入口、图标和 Zod 许可证已核对。包内 canary、JWT、私钥和 API key 形态扫描无匹配 |
| 隔离原生测试 | 锁定基座 `5178a049eddcf03778125be1db3ae523621f2fc3`。同一包在断网 Linux ARM64、Node `24.22.2` 容器运行 46 项，通过 |
| 隔离 Web 宿主 | 同一包在容器中的官方 `0.2.2-rc.1` 安装、启动、渲染原生设置、读取离线状态及卸载通过。Playwright `1.56.1`、Chromium `141.0.7390.37`。`0.2.1-rc.4` 按版本约束拒绝安装。另用 macOS ARM64 官方随附 CLI 在独立 Web profile 核对安装、合成配置、Client 字节及移除 |
| 实机登录和推理 | 本候选尚未复测。先前 UI 候选的 [Web 登录复用和真实回复](siwc-ui-web-2026-11-13.md)及 [Desktop 验收](p4-local-native-2026-11-11.md)对应各自的包摘要 |

## 发布前事项

- `npm audit --omit=dev` 由最初 3 个高危包项降到 1 个。插件直接使用的 Zod 从 `4.4.3` 更新到 `4.6.7`，并在包内保留随 Client bundle 分发的 MIT 许可。剩余项为 `@deepseek-ai/dsh-http-proxy@0.2.2-rc.1` 精确依赖的 `undici@8.11.2`。该宿主包能安装全局 dispatcher，插件的 SIWC transport 使用宿主 `fetch`，因此需针对受支持宿主核对修复版本与可达性。[Zod 公告](https://github.com/colinhacks/zod/security/advisories/GHSA-mrhx-c7xc-m3w5) · [Undici 公告示例](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx)
- 官方 SIWC 有面向开源及本地部署应用的订阅调用文档，付费或远程托管应用另有申请入口。公开包仍需确认发行身份与渠道。本地候选将 ChatGPT 标识用于插件主图标，OpenAI 品牌指南区分服务标识和应用主品牌。公开候选应确认该用途获准，或使用独立插件图标后重新打包验收。[SIWC 概览](https://developers.openai.com/siwc/token-sharing-open-source) · [OpenAI 品牌指南](https://openai.com/brand/)
- [本地安装与维护](../local-install.md)覆盖数据流、安装、更新、退出、撤销、卸载和回退。最终候选的 Desktop 验收、真实账号场景及公开渠道分别记录。

复跑入口见[打包检查](../../test/README.md#p1-包骨架)、[隔离宿主](../../test/README.md#p2-隔离宿主)和[原生探针](../../test/README.md#p3-隔离宿主验证)。
