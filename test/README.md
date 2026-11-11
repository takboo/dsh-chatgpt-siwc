# 测试入口

## P1 包骨架

从项目根目录用 Node `26.13.0`、npm `11.20.0` 复跑。依赖只安装在此工作区。测试使用隔离 Cordis composition、Client factory 测试替身及临时 credentials backing。

```sh
npm --cache "$PWD/npm-cache" ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run check:pack
```

`npm test` 构建 Host 与 Client 入口后运行探针。也可以单独运行 `npm run build`。包校验核对真实 tarball 的入口、patch、双语资源、图标、许可及文件清单，保存在 `artifacts/p1/<SHA-256>/`。

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
