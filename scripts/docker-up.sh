#!/bin/sh
# Local rebuild: build from Dockerfile and start, then reload edge nginx.
# Production servers should use ./deploy.sh (pull CI image, no local build).
# Usage: ./scripts/docker-up.sh
set -eu
cd "$(dirname "$0")/.."

EDGE_NGINX_CONTAINER="${EDGE_NGINX_CONTAINER:-edge_nginx}"

docker compose up -d --build --remove-orphans

echo "Waiting for blog-react-app to become healthy..."
i=0
status="starting"
while [ "$i" -lt 90 ]; do
  status="$(docker inspect -f '{{.State.Health.Status}}' blog-react-app 2>/dev/null || echo starting)"
  if [ "$status" = "healthy" ]; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$status" != "healthy" ]; then
  echo "blog-react-app did not become healthy (status: $status). Skipping nginx reload." >&2
  exit 1
fi

if docker inspect "$EDGE_NGINX_CONTAINER" >/dev/null 2>&1; then
  docker exec "$EDGE_NGINX_CONTAINER" nginx -s reload
  echo "Reloaded $EDGE_NGINX_CONTAINER"
else
  echo "Container $EDGE_NGINX_CONTAINER not found; skip nginx reload"
fi
