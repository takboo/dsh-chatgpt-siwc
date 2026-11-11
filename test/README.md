# 测试入口

## P3 离线 Responses

在根目录执行 `npm test`，或构建后执行 `node --test --test-timeout=15000 test/p3/*.test.mjs`。测试通过已发布的 DSH LLM runtime 和合成 OAuth 驱动打包适配器，捕获实际 SDK HTTP 请求并用 SSE fixture 回应。覆盖文本、用量、namespace function 的两轮交换、重建 adapter 后回放、异常终态和取消。[首轮证据](../docs/evidence/p3-offline-2026-11-11.md)记录观察范围。

## P3 隔离宿主验证

从干净候选提交构建一次并运行 `npm run check:pack`，将产物绝对路径赋给 `artifact`。未提交的候选可先保存为独立临时 Git 快照。将已核对的基座 checkout 路径赋给 `base_checkout`。原生探针核对 checkout 的 origin、tag 与 SHA，从锁定基座读取 Node 镜像，预取锁定 npm 依赖后在断网、只读根文件系统的容器中运行。探针从 tarball 解出 Host 入口，并在容器临时目录创建合成凭据、工作区和 JSONL 会话。

```sh
bash test/p3/run-native.sh "$base_checkout" "$artifact"
bash "$base/scripts/run-container.sh" cli test/p2/host-targets.json \
  test/p2/host-probe.mjs "$artifact" "$(git rev-parse HEAD)" "$work/cli-report.json"
```

第二条命令的 `base` 为按下文导出的锁定基座，`work` 为现有的临时报告目录。CLI 复核候选包的实际安装、卸载和旧版拒绝。断网容器执行整套 P3 探针，使用官方 Host 的 Agent、审批、文件沙箱、压缩、重试、JSONL 和 Loader。压缩摘要走独立的合成模型路由。原生生命周期测试通过 Loader 移除并重新挂载 fixture 入口，入口调用候选包的 Host 装配函数。

## P2 离线账号和界面

按下方安装锁定依赖。根目录的 `npm test` 构建包并执行 P1／P2 测试，覆盖 loopback、合成签名、真实本地 backing、DSH Typert 和目录。替身传输只接受测试中的固定端点。

设置页的浏览器 fixture 使用同一份构建和锁定 DSH 源码中的 Button、Tag 与主题 token。准备下方配置检查所用的 DSH 源码，赋值给 `dsh_source`，再从根目录执行：

```sh
p2_ui_dir=$(mktemp -d)
node test/p2/browser-fixture.mjs "$dsh_source" "$p2_ui_dir"
cp test/p2/browser-check.mjs "$p2_ui_dir/"
npm --prefix "$p2_ui_dir" --cache "$p2_ui_dir/npm-cache" install --ignore-scripts --no-audit --no-fund --save-exact playwright@1.56.1
docker run --rm --network none --shm-size=1g \
  -v "$p2_ui_dir:/fixture" \
  mcr.microsoft.com/playwright:v1.56.1-noble@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a \
  node /fixture/browser-check.mjs
```

截图保留在临时 fixture 目录。此入口运行合成界面流程。

## P2 隔离宿主

从[工程锁](../dsh-engineering.lock.json)核对基座 checkout 的 origin、tag 和 SHA，并导出锁定提交到临时目录 `base`。在 `base/.engineering-revision` 写入完整 SHA。按下方命令构建并检查一次 tarball，将绝对路径赋给 `artifact`。两个宿主使用同一 tarball。用干净的候选提交运行：

```sh
bash "$base/scripts/run-container.sh" all test/p2/host-targets.json \
  test/p2/host-probe.mjs "$artifact" "$(git rev-parse HEAD)" "$work/web-report.json"
```

macOS ARM64 Desktop 使用同一基座的共享 Tart 实验室。准备仅供本轮的 `inputs` 目录，放入：

- 官方签名的 `DeepSeek Harness.app` 0.2.2-rc.1，通过 `ditto -c -k --sequesterRsrc --keepParent` 生成 `dsh-desktop-0.2.2-rc.1.zip`。
- 同一份 `local-dsh-chatgpt-siwc-0.0.0.tgz`、`test/p2/host-probe.mjs` 和 `test/p2/desktop-probe.mjs`。
- npm 的 `playwright-core@1.56.1` 原包，命名为 `playwright-core.tgz`。它只连接来宾中签名应用的回环调试端口。
- `pnpm.tar`，包含 `pnpm-store` 和 `pnpm-cache`。预取时在临时 home 和 `DSH_HOME` 下设置 `pnpm_config_store_dir`、`pnpm_config_cache_dir`，通过官方应用随附的 CLI 将 tarball 安装到临时 Web profile。只归档这两个缓存目录。

```sh
(cd "$inputs" && shasum -a 256 *.tgz *.mjs *.zip pnpm.tar > SHA256SUMS)
DSH_TART_INPUTS="$inputs" bash "$base/scripts/run-tart.sh" --tart-home "$lab" \
  run test/p2/desktop-guest.sh
```

来宾核对签名、版本和输入摘要，在隔离 profile 经官方图形插件管理器安装、启用并打开设置，然后重启应用复查。环境报告记录镜像、来宾系统、候选包摘要和回收结果。此入口验证默认离线构建。合成账号流程与真实账号验证分别取证。

## P1 包骨架

从项目根目录用 Node `26.13.0`、npm `11.20.0` 复跑。依赖只安装在此工作区。测试使用隔离 Cordis composition、Client factory 测试替身及临时 credentials backing。

```sh
npm --cache "$PWD/npm-cache" ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run check:pack
```

`npm test` 构建 Host 与 Client 入口后运行探针。也可以单独运行 `npm run build`。包校验核对真实 tarball 的入口、patch、双语资源、图标、许可及文件清单，保存在 `artifacts/pack/<SHA-256>/`。

可从 [DSH 固定提交](https://github.com/deepseek-ai/deepseek-harness/tree/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db) 准备源码，执行 `npm run check:profile -- <源码目录>`。此检查使用上游合成器，核对 Web 和 Desktop 共用的 bundle 层、title 及四个 preset 的 compaction 配置。宿主安装与运行另行验证。

## P0 离线核对

从项目根目录复跑。使用 Node `26.13.0` 与 npm `11.20.0`，按 `test/p0/package-lock.json` 预取公开服务包和 SDK 到临时目录，再以空环境执行 fixture。所有推理／目录响应由合成 `fetch` 提供，凭据写入本次临时文件。

```sh
(
  set -eu
  p0_dir=$(mktemp -d)
  trap 'rm -rf "$p0_dir"' EXIT
  cp test/p0/package*.json test/p0/tsconfig.json test/p0/*.mts test/p0/*.mjs "$p0_dir/"
  cd "$p0_dir"
  npm --cache "$p0_dir/npm-cache" ci --ignore-scripts --no-audit --no-fund
  env -i PATH="$PATH" npm --cache "$p0_dir/npm-cache" test
)
```

适用范围、已观察到的差异和后续门槛见 [P0 报告](../docs/evidence/p0-offline-2026-11-11.md)。

## 后续用例

按[验收标准](../docs/acceptance.md)建立 auth、codec、stream、catalog、lifecycle 与 integration 用例。纯 codec 使用冻结输入。Auth 注入时钟、随机源和 HTTP。Rotation 与 logout race 使用真实 credential backing 和多个进程。
