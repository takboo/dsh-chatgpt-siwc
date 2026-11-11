# 接手入口

先读 [文档索引](docs/README.md)，再按任务读取对应契约。

- 工程接入、宿主验证或取证前，按[基座锁](dsh-engineering.lock.json)核对本机 checkout 的 origin、tag 和 SHA，从锁定提交读取 `.agents/skills/dsh-plugin-onboarding/SKILL.md`。普通 Web 回归使用 Linux 容器内的固定 Chromium。
- 实施前核对[计划](docs/implementation-plan.md)的阶段门和[验收入口](docs/acceptance.md)的适用版本、复跑命令及证据。
- 改动模型协议、OAuth 或凭据时读[实施方案](docs/architecture.md)和[安全设计](docs/security.md)，同步相应验收用例。
- 研究、依赖或准入判断变化时更新[可行性](docs/research/feasibility.md)，保留主源、日期及事实／推论／待实测的区分。
- 使用 DSH 原生 llm、authorization、credentials seam；只注册自身 provider。每次请求保持单次推理，工具执行和重试调度留给 DSH。
- 安装、真实账号登录和发布须获得对应授权；在隔离 profile 执行，并按[证据模板](docs/evidence/README.md)记录。密钥和未脱敏 OAuth 数据留在仓库之外。
- 真实账号复测按[注册复用规范](docs/security.md#真实账号复测)沿用已有 `client_id`。

## Git 提交

- 所有提交保持原子性。每个提交只处理一个可独立验证和回退的变更，所需的测试、文档和锁文件随变更一起提交。
- 提交标题和正文使用中文。标题简明说明做了什么，必要时在正文交代动机、影响和验证结果。
- 提交前审阅暂存差异，确认文件都属于该变更，并运行适用检查。
