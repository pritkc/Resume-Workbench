#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
exec 9>.update.lock
flock -n 9 || exit 0

image=ghcr.io/pritkc/resume-workbench:latest
docker pull "$image"
new_image=$(docker image inspect "$image" --format '{{index .RepoDigests 0}}')
old_image=$(sed -n 's/^APP_IMAGE=//p' .env)

if [[ -z "$old_image" ]]; then
  echo 'APP_IMAGE is missing from .env.' >&2
  exit 1
fi
if [[ "$new_image" == "$old_image" ]]; then
  echo 'No application update.'
  exit 0
fi

# Keep the previous app running until the backup and schema migration succeed.
./backup.sh
if ! APP_IMAGE="$new_image" docker compose run --rm --no-deps \
  resume-workbench sh -c 'cd /app/backend && alembic upgrade head'; then
  echo 'Database migration failed. The previous application is still running.' >&2
  exit 1
fi

cp -p .env .env.previous
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=${new_image}|" .env

if docker compose up -d --no-deps --wait --wait-timeout 180 resume-workbench; then
  for attempt in 1 2 3; do
    if python3 verify.py; then
      echo "Updated application: ${new_image}"
      exit 0
    fi
    [[ "$attempt" == 3 ]] || sleep 5
  done
fi

echo 'Application verification failed. Restoring the previous image.' >&2
cp -p .env.previous .env
docker compose up -d --no-deps --wait --wait-timeout 180 resume-workbench
python3 verify.py
exit 1
