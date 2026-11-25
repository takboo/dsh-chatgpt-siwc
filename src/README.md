# 源码布局

- [`index.ts`](index.ts)：Host 入口，装配账号服务、设置 RPC、模型目录与 Responses provider；离线 fixture 通过 `attachAccounts` 注入传输和浏览器启动器。
- [`host/`](host/)：Host 核心实现，包含 OAuth、loopback 回调、凭据存储、账号状态、模型目录、搜索及 Responses 请求与流结算。
- [`client.ts`](client.ts)：Client 入口，将设置面板挂载到 `plugins.bundle.config`，将用量组件挂载到 `conversation.input.right`。
- [`client/`](client/)：前端子模块，包含设置面板（`settings.tsx`）、用量展示（`usage.tsx`）与双语文案辅助（`locale.ts`）。
- [`typert.ts`](typert.ts)：导出插件的 Typert 协议声明入口。
- [`remote.ts`](remote.ts)：定义 Host 与 Client 间 `chatgptSiwc/settings` 远程调用描述符及严格编解码器。
- [`schema.ts`](schema.ts)：用 `zod/mini` 定义设置操作与返回结果的校验 schema。
- [`view.ts`](view.ts)：声明账号、模型、设置视图与操作结果的 TypeScript 类型。
- [`identity.ts`](identity.ts)：集中定义 `providerId`、包名与订阅标识文案。

协议、生命周期和重放边界见[实施方案](../docs/architecture.md)，离线复跑与宿主验证见[测试入口](../test/README.md)。
