#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-pritkc/Resume-Workbench}"
host="${ORACLE_HOST:-ubuntu@oci-main}"
key="${ORACLE_SSH_KEY:-$HOME/.ssh/oci}"
mode="${1:-release}"

show_live_version() {
  curl --location --fail --silent --show-error https://resumes.pritk.com/api/v1/status | python3 -c '
import json, sys
data = json.load(sys.stdin)
print("Live application: v{} · {}".format(
    data.get("version", "unknown"),
    data.get("commit", "unknown")[:12],
))
'
}

show_host_status() {
  ssh -i "$key" "$host" \
    "cd /home/ubuntu/resume-workbench && grep '^APP_IMAGE=' .env && sudo systemctl --no-pager --full status resume-workbench-update.timer | head -12"
  show_live_version
}

if [[ "$mode" == "status" ]]; then
  show_host_status
  exit 0
fi

if [[ "$mode" != "release" ]]; then
  echo "Usage: $0 [release|status]" >&2
  exit 2
fi

run_id=$(gh run list \
  --repo "$repo" \
  --workflow docker-publish.yml \
  --branch main \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')

if [[ -z "$run_id" ]]; then
  echo "No Docker publish run was found for main." >&2
  exit 1
fi

echo "Waiting for Docker publish run $run_id."
gh run watch "$run_id" --repo "$repo" --exit-status

echo "Starting the Oracle updater."
ssh -i "$key" "$host" \
  'sudo systemctl start resume-workbench-update.service; result=$?; sudo journalctl -u resume-workbench-update.service -n 30 --no-pager; exit $result'

show_live_version
