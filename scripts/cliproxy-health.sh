#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${CLIPROXY_BASE_URL:-http://127.0.0.1:8317}"
API_KEY="${CLIPROXY_API_KEY:-}"

echo "==> Checking ${BASE_URL}/healthz"
if ! curl -fsS "${BASE_URL}/healthz" | sed -e 's/^/  /'; then
  echo
  echo "Health check failed (proxy not reachable on ${BASE_URL})." >&2
  echo "  - docker ps -a --filter name=cli-proxy-api" >&2
  echo "  - make cliproxy-logs   # or: docker logs cli-proxy-api --tail 80" >&2
  echo "If status is Restarting, fix infra/cliproxyapi/config.yaml (see SETUP.md Option C)." >&2
  exit 7
fi
echo

if [[ -z "${API_KEY}" ]]; then
  echo "CLIPROXY_API_KEY is not set; skipping /v1/models check."
  exit 0
fi

CONFIG_FILE="${CLIPROXY_REPO_CONFIG:-}"
if [[ -f "${CONFIG_FILE}" ]]; then
  expected="$(awk '/^api-keys:/{k=1;next} k&&/^  - /{sub(/^  - /,""); gsub(/^"|"$/,""); print; exit}' "${CONFIG_FILE}")"
  if [[ -n "${expected}" && "${API_KEY}" != "${expected}" ]]; then
    echo "cliproxy-health: CLIPROXY_API_KEY must match the first api-keys entry in ${CONFIG_FILE}." >&2
    echo "  Expected: ${expected}" >&2
    echo "  Got:      ${API_KEY}" >&2
    exit 2
  fi
fi

echo "==> Checking ${BASE_URL}/v1/models"
curl -fsS "${BASE_URL}/v1/models" \
  -H "Authorization: Bearer ${API_KEY}" | sed -e 's/^/  /'
echo
