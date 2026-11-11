# 测试入口

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
