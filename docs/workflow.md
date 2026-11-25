# 工作流与验证门禁

本仓库通过[基座锁](../dsh-engineering.lock.json)固定 `dsh-plugin-engineering` 版本，以根目录 [`mise.toml`](../mise.toml) 作为唯一验证入口。

## 运行时与基座准备

1. 安装锁定运行时并信任配置：`mise trust && mise install`（要求 `mise >= 2026.10.2`，锁定 `node = "24.22.2"`）。
2. 指定本机基座 checkout（必选其一）：设置 `DSH_ENGINEERING_CHECKOUT`，或在 `~/.config/dsh-plugin-engineering/checkout`（尊重 `XDG_CONFIG_HOME`）写入唯一绝对路径；[`mise.toml`](../mise.toml) 按同一优先级解析 `DSH_BASE_DIR` 以定位 `locked-run.mjs`（未配置时基座脚本按预期以 `Missing checkout` 失败关闭）。
3. 核对环境与基座锁：
   ```sh
   mise exec -- sh -c 'node "$DSH_BASE_DIR/scripts/locked-run.mjs" doctor'
   ```
   读取锁定提交的工程契约文档：`locked-run.mjs docs docs/engineering-contract.md` / `docs/plugin-onboarding.md`。

## 标准门禁命令

| 命令 | 覆盖范围 |
|---|---|
| `mise run setup` | 使用工作区 `npm-cache` 执行 `npm ci --ignore-scripts --no-audit --no-fund` |
| `mise run check` | 统一 `E0` + `E1` 门禁：`check:shell`（`locked-run.mjs check-plugin`）、`lint`、`typecheck`、`test`、`check:pack` |
| `mise run verify:host` | 严格串行 `build` → `verify:pack` → `locked-run.mjs container all ... HEAD "$DSH_VERIFY_HOST_DIR/report.json"`（`E2`）；正式取证须从干净候选提交（`git status` 无未提交源码改动）开始 |

## 本插件保留的专属边界

- **E1 候选包元数据校验**：[`scripts/check-pack.mjs`](../scripts/check-pack.mjs) 在打包后校验 `package.json`、`cordis.patch.yml`、`engines.dsh`、`THIRD_PARTY_NOTICES.md`、`icon.svg`、`locale/{en,zh}.json`、`exports` 与 `dist/*` 字节一致；`verify:pack` 将同一份已校验 tarball 独占暂存至每轮独立的 `artifacts/verify-host/run-*/candidate.tgz`（拒绝复用已有 `candidate.tgz` 或 `report.json`），保证 `E2` 测试的是同一个 SHA-256 产物且并发运行互不覆盖。
- **P3 原生容器测试**：[`test/p3/run-native.sh`](../test/p3/run-native.sh) 从锁定基座提交读取固定 Node 24 镜像，在断网、只读根文件系统容器中验证打包后的 Host 入口与 DSH 原生运行时集成。

## 证据分级（E0–E4）

报告结果必须实名区分已执行等级与未执行项；未实跑等级一律标为 `not-run`，不得省略或假绿。

| 等级 | 含义与产出 | 典型入口 |
|---|---|---|
| `E0` | 工程外壳、文档链接、`.rgignore`、锁文件与 `mise.toml` 契约 | `locked-run.mjs doctor`、`mise run check`（`check:shell`） |
| `E1` | ESLint、TypeScript、P1–P3 离线单测与候选 `.tgz` 元数据校验 | `mise run check`（`lint` / `typecheck` / `test` / `check:pack`） |
| `E2` | 隔离 Linux Docker 宿主（CLI 安装/卸载/旧版拒绝 + 固定 Chromium Web）与 `provenance` 报告；以及 P3 原生容器测试 | `mise run verify:host`、`bash test/p3/run-native.sh` |
| `E3` | 隔离 macOS Tart 来宾或官方 Desktop 图形宿主、本机隔离 profile 真实账号验收 | `locked-run.mjs tart`、[测试入口](../test/README.md#p4-交互验收) |
| `E4` | 公开发布包、渠道收录与真实安装核验 | 按[验收标准](acceptance.md)与[证据索引](evidence/README.md)记录 |

## 变更面与最低验证矩阵

| 变更面 | 最低验证要求 |
|---|---|
| 仅文档、索引或 `.rgignore` | `mise run check`（至少确认 `check:shell` 零违规） |
| `mise.toml`、`dsh-engineering.lock.json`、`scripts/check-pack.mjs` | `locked-run.mjs doctor` + `mise run check` + `mise run verify:host`（核对 `provenance`） |
| `src/`、`locale/`、`icon.svg`、`cordis.patch.yml`、`package.json` | `mise run check` + `mise run verify:host`；涉及 Host/Responses 另跑 `test/p3/run-native.sh`；涉及真实授权或桌面行为按[测试入口](../test/README.md#p4-交互验收)补跑 `E3` |

## 交付规则

- 改动模型协议、OAuth 或凭据前同步核对[实施方案](architecture.md)、[安全设计](security.md)与[验收标准](acceptance.md)。
- 原子提交、中文提交信息与暂存审阅规则见[接手入口](../AGENTS.md#git-提交)；验收取证与脱敏要求见[证据索引](evidence/README.md)。
