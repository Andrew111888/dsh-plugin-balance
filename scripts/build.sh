#!/bin/bash
# Official-style build for dsh-plugin-balance.
#
# This plugin ships pre-built plain-JS artifacts in lib/ (no tsc step), so
# "build" validates the distributable: syntax-check the host/client bundles,
# verify the package metadata that DSH's loader and client-module system
# depend on. Run with --check to only validate (used by `npm run typecheck`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

command -v node >/dev/null || { echo "build: node required" >&2; exit 1; }

fail=0

# 1) Host half must be valid ESM.
node --check lib/index.js || { echo "build: lib/index.js 语法错误" >&2; fail=1; }

# 2) Client half must be a self-contained module-loader bundle.
node --check lib/client.js || { echo "build: lib/client.js 语法错误" >&2; fail=1; }
if ! grep -q "__ModuleLoader__.load" lib/client.js; then
  echo "build: lib/client.js 缺少 __ModuleLoader__.load 入口" >&2
  fail=1
fi

# 3) package.json metadata sanity.
node -e '
  const p = require("./package.json");
  if (!p.main) throw new Error("main 缺失");
  if (!p.exports || !p.exports["."] || !p.exports["./client"]) throw new Error("exports 不完整");
  if (!p.dsh || !p.dsh.client) throw new Error("dsh.client 配置缺失");
  console.log("package.json OK: " + p.name + "@" + p.version);
' || fail=1

if [ "$fail" -ne 0 ]; then
  echo "build: 校验未通过" >&2
  exit 1
fi

echo "=== Build check passed (pure-JS bundle, nothing to compile) ==="
exit 0
