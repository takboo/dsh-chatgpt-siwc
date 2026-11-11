# 源码布局

- [`index.ts`](index.ts) 装配 Host 服务、账号操作和目录，并注册独立 provider。离线 fixture 通过 `attachAccounts` 注入传输和浏览器启动器。
- [`host/`](host/) 实现 OAuth、loopback、凭据、目录和 Responses 请求及流结算。
- [`client.ts`](client.ts) 通过 DSH 的 `plugins.bundle.config` 挂到插件详情。[`typert.ts`](typert.ts) 声明 Host 和 Client 共用的设置接口。

协议、生命周期和重放边界见[实施方案](../docs/architecture.md)，离线复跑见[测试入口](../test/README.md)。
