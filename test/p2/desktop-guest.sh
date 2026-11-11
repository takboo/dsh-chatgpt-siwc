#!/bin/bash
set -euo pipefail
umask 077

inputs='/Volumes/My Shared Files/dsh-inputs'
work=$(mktemp -d /private/tmp/siwc-desktop.XXXXXX)
trap 'rm -rf -- "$work"' EXIT

sw_vers
[[ "$(uname -m)" == arm64 ]]
console_user=$(stat -f %Su /dev/console)
[[ "$(id -un)" == "$console_user" ]]
launchctl print "gui/$(id -u)" >/dev/null
(cd "$inputs"; shasum -a 256 -c SHA256SUMS)
ditto -x -k "$inputs/dsh-desktop-0.2.2-rc.1.zip" "$work"
app="$work/DeepSeek Harness.app"
[[ "$(plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist")" == 0.2.2-rc.1 ]]
codesign --verify --deep --strict -R '=anchor apple generic and identifier "com.deepseek.dsh" and certificate leaf[subject.OU] = "NAN929V4UM"' "$app"
codesign -dv "$app" 2>&1 | awk '/^(Identifier|TeamIdentifier)=/'

mkdir "$work/home" "$work/dsh" "$work/playwright" "$work/user-data"
tar -xf "$inputs/pnpm.tar" -C "$work"
tar -xzf "$inputs/playwright-core.tgz" --strip-components 1 -C "$work/playwright"
cp "$inputs/desktop-probe.mjs" "$inputs/host-probe.mjs" "$work/"
export HOME="$work/home" DSH_HOME="$work/dsh"
export DSH_TELEMETRY_DISABLED=1
export pnpm_config_store_dir="$work/pnpm-store" pnpm_config_cache_dir="$work/pnpm-cache" pnpm_config_offline=true
node="$app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"
"$node" --version
"$node" "$work/desktop-probe.mjs" "$app/Contents/MacOS/DeepSeek Harness" "$work/user-data" "$inputs/local-dsh-chatgpt-siwc-0.0.0.tgz"
