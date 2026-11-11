#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Usage: bash test/p3/run-native.sh <engineering checkout> <candidate.tgz>' >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/../.." && pwd -P)"
base="$(cd "$1" && pwd -P)"
artifact="$(cd "$(dirname "$2")" && pwd -P)/$(basename "$2")"
[[ -f "$artifact" && -z "$(git -C "$root" status --porcelain)" ]]

lock="$root/dsh-engineering.lock.json"
repository="$(node -p 'require(process.argv[1]).repository' "$lock")"
tag="$(node -p 'require(process.argv[1]).tag' "$lock")"
commit="$(node -p 'require(process.argv[1]).commit' "$lock")"
origin="$(git -C "$base" remote get-url origin)"
[[ "$origin" == "$repository" || "$origin" == "git@github.com:${repository#https://github.com/}" ]]
[[ "$(git -C "$base" rev-parse --verify "refs/tags/${tag}^{commit}")" == "$commit" ]]
node_image="$(git -C "$base" show "$commit:scripts/run-container.sh" | sed -n "s/^node_image='\([^']*\)'$/\1/p")"
[[ "$node_image" =~ @sha256:[a-f0-9]{64}$ ]]

stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/test/p0" "$stage/test/p2" "$stage/test/p3"
cp "$root/package.json" "$root/package-lock.json" "$stage/"
cp "$root/test/p0/sse.mjs" "$stage/test/p0/"
cp "$root/test/p2/fixtures.mjs" "$stage/test/p2/"
cp "$root/test/p3/"*.mjs "$stage/test/p3/"
cp "$artifact" "$stage/candidate.tgz"
cat > "$stage/Dockerfile" <<'DOCKER'
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /fixture
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY test/ test/
COPY candidate.tgz /inputs/candidate.tgz
RUN tar -xzf /inputs/candidate.tgz --strip-components=1 package/dist/index.js
USER node
ENV HOME=/tmp/fixture-home DSH_HOME=/tmp/fixture-home/dsh
CMD ["sh", "-ec", "mkdir -p \"$DSH_HOME\"\nnode -p 'process.platform + \"/\" + process.arch + \" \" + process.version'\nsha256sum /inputs/candidate.tgz\nnode --test --test-timeout=15000 test/p3/*.test.mjs"]
DOCKER
export BUILDX_CONFIG="${BUILDX_CONFIG:-$stage/buildx}"
image="$(docker build --quiet --build-arg "NODE_IMAGE=$node_image" "$stage")"
printf 'sourceCommit=%s\nbaseCommit=%s\nnodeImage=%s\ntestImage=%s\n' \
  "$(git -C "$root" rev-parse HEAD)" "$commit" "$node_image" "$image"
shasum -a 256 "$stage/candidate.tgz" "$root/package-lock.json" "$root/test/p3/run-native.sh" |
  awk '{name=$2; sub(/^.*\//, "", name); print $1, name}'
docker run --init --rm --network none --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,mode=1777 "$image"
