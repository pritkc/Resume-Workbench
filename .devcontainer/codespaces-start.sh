#!/usr/bin/env bash
set -Eeuo pipefail

AUTO_START=false
if [[ "${1:-}" == "--auto" ]]; then
  AUTO_START=true
fi

COMPOSE_FILES=(-f docker-compose.yml -f .devcontainer/docker-compose.codespaces.yml)

info() {
  printf '[codespaces] %s\n' "$*"
}

fail() {
  printf '[codespaces] ERROR: %s\n' "$*" >&2
  exit 1
}

skip_auto() {
  info "$*"
  if [[ "${AUTO_START}" == "true" ]]; then
    exit 0
  fi
  exit 1
}

compose() {
  docker compose "${COMPOSE_FILES[@]}" "$@"
}

has_env_file_key() {
  [[ -f .env ]] && grep -Eq '^[[:space:]]*LLM_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+' .env
}

if [[ "${CODESPACES:-}" != "true" ]]; then
  skip_auto "This startup helper only runs in GitHub Codespaces. Use 'docker compose up --build' for local Docker."
fi

command -v docker >/dev/null 2>&1 || fail "Docker is not available in this Codespace."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is not available in this Codespace."

if [[ -z "${LLM_API_KEY:-}" ]] && ! has_env_file_key; then
  cat >&2 <<'EOF'
[codespaces] Resume Workbench was not started.
[codespaces] Configure a private LLM_API_KEY before starting the stack:
[codespaces]   1. Preferred: add LLM_API_KEY as a GitHub Codespaces secret for this repository.
[codespaces]   2. Or create an uncommitted .env file in the repository root with LLM_API_KEY=<your key>.
[codespaces]
[codespaces] The .env file is ignored by Git. Do not commit real provider credentials.
EOF
  if [[ "${AUTO_START}" == "true" ]]; then
    exit 0
  fi
  exit 1
fi

info "Validating Docker Compose configuration."
compose config --quiet

info "Starting Resume Workbench with Codespaces overrides."
compose up -d --build --wait

info "Checking frontend and API health through port 3000."
curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null

info "Resume Workbench is running. Open the private forwarded port 3000."
