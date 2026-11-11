# 验证记录规则

[P0 离线报告](p0-offline-2026-11-11.md)记录首轮立项和合成验证。真实账号原始数据留在工作区之外。

每次验证另建脱敏 Markdown 记录，包含：

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
