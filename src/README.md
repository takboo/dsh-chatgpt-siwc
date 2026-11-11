# 计划源码布局

`index.ts` 注册独立 provider、账号操作和目录。`host/` 包含 OAuth、loopback、凭据和目录逻辑。`client.ts` 通过 DSH 的 `plugins.bundle.config` 挂到插件详情，使用 `typert.ts` 定义的脱敏操作。离线 fixture 通过 Host 装配入口注入传输和浏览器启动器。推理按[实施方案](../docs/architecture.md)在 P3 接入。

源码和 bundle patch 在 P1 才创建；现在不提供空 apply 或伪造成功的占位实现。
