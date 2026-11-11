# 计划源码布局

当前没有运行代码。按[实施方案](../docs/architecture.md)逐阶段建立 TypeScript ESM 的 Host entry、adapter、auth、codec、transport 和 catalog。内部模块保持私有。最小 Client 扩展的决策入口见[宿主接口快照](../docs/research/dsh-contracts.md#client-公开扩展)。

源码和 bundle patch 在 P1 才创建；现在不提供空 apply 或伪造成功的占位实现。
