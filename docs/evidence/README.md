# 验证记录

各报告的结论适用于其中标识的版本、候选包和测试范围。当前阶段见[实施计划](../implementation-plan.md)，复跑步骤见[测试入口](../../test/README.md)。

| 阶段 | 验收与历史记录 |
|---|---|
| P0 | [立项与离线核对](p0-offline-2026-11-11.md) |
| P1 | [插件骨架与打包](p1-offline-2026-11-11.md) |
| P2 | [合成授权和目录](p2-offline-2026-11-11.md) · [Web 与 macOS Desktop 安装](p2-host-2026-11-11.md) |
| P3 | [Responses 协议](p3-offline-2026-11-11.md) · [原生工具和会话](p3-native-2026-11-11.md) · [离线验收矩阵](p3-acceptance-2026-11-11.md) |
| P4 | [本机双宿主验收与问题处置](p4-local-native-2026-11-11.md) · [早期真实账号与最小推理](p4-real-account-2026-11-11.md) · [联机候选与出网](p4-candidate-2026-11-11.md) · [Tart 交互环境](p4-interactive-2026-11-11.md) |
| L5 复测 | [默认压缩配置下的双宿主模型切换](default-model-switch-2026-11-12.md) |
| W2 复测 | [SIWC 推理档位探针与 Desktop 原生选档](siwc-reasoning-desktop-2026-11-12.md) |

## 记录模板

每次验证使用脱敏 Markdown 记录。真实账号原始数据留在工作区之外。

```text
日期／时区：
阶段与验收 ID：
结果：pass / fail / blocked / not-run
插件 commit（无 git 时注明）与工作树状态：
共享基座 Git SHA／执行入口与镜像摘要或来宾版本：
插件版本／lockfile 摘要／分发包 SHA-256：
DSH、Cordis、Node、OS 版本：
profile（脱敏）、运行入口（GUI/CLI）、测试命令：
步骤、期望、实际结果：
官方文档核对日期与 URL：
安全 request ID／用量是否可见：
脱敏证据位置与 SHA-256：
未覆盖项与恢复的用户状态：
```

安装结果、Client 注册、页面实际观察、真实推理分别记；无浏览器观察能力时明确未验证视觉。不要在 token、callback URL 或原始 JWT 上求摘要后就视作安全脱敏。原始受限材料放仓库外，进入本目录的任何材料先检查再人工复核。
