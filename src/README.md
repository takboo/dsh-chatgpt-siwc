# 计划源码布局

P1 的 `index.ts` 是 Host 入口，注册独立 provider。`client.ts` 通过 DSH 公开的 `plugins.bundle.config` 挂到插件详情，显示登录功能的当前构建状态。OAuth、目录、codec 和推理按[实施方案](../docs/architecture.md)接入。

源码和 bundle patch 在 P1 才创建；现在不提供空 apply 或伪造成功的占位实现。
