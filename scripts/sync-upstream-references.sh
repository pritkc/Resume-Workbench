#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF_DIR="${ROOT_DIR}/reference"

mkdir -p "${REF_DIR}"

sync_repo() {
  local name="$1"
  local url="$2"
  local dir="${REF_DIR}/${name}"

  echo "==> ${name}"
  if [[ -d "${dir}/.git" ]]; then
    git -C "${dir}" fetch --prune --tags origin
    local head_branch
    head_branch="$(git -C "${dir}" remote show origin | sed -n 's/.*HEAD branch: //p' | tail -n1)"
    if [[ -n "${head_branch}" ]]; then
      git -C "${dir}" checkout "${head_branch}" >/dev/null 2>&1 || true
      git -C "${dir}" pull --ff-only origin "${head_branch}"
    fi
  else
    git clone --depth 1 "${url}" "${dir}"
  fi

  local sha
  sha="$(git -C "${dir}" rev-parse --short HEAD)"
  echo "    synced at ${sha}"
}

sync_repo "CLIProxyAPI" "https://github.com/router-for-me/CLIProxyAPI.git"
sync_repo "Cli-Proxy-API-Management-Center" "https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git"

echo "Done. References are available under ${REF_DIR}"
