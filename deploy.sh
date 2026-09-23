#!/bin/sh
# Server deploy: pulls latest code + the CI-built image, no local Docker build.
#
# One-time setup on the server (image is private to the repo by default):
#   echo <GITHUB_PAT_with_read:packages> | docker login ghcr.io -u <github-username> --password-stdin
#
# Usage: ./deploy.sh
#
# CI builds the image on every push to main (.github/workflows/docker-build.yml).
# Merge/push to main, wait for a green Actions check, then run this script.
set -e

echo "==> git pull"
git pull --ff-only

IMAGE="${APP_IMAGE:-ghcr.io/webcretatechnologies/shopifyapp-blogwithreactjs:latest}"
before_id=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo "")

echo "==> docker compose pull (fetch image built by CI)"
docker compose pull app

after_id=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo "")

if [ -n "$before_id" ] && [ "$before_id" = "$after_id" ]; then
  echo ""
  echo "==> No new image found on GHCR (pulled digest is unchanged)."
  echo "    If you just pushed a code change, the CI build likely hasn't"
  echo "    finished yet — check the Actions tab on GitHub, then re-run"
  echo "    ./deploy.sh once it shows a green check."
  echo ""
  read -p "Continue anyway and restart containers with the current image? [y/N] " confirm
  case "$confirm" in
    y|Y) ;;
    *) echo "Aborting."; exit 0 ;;
  esac
fi

# app runs `prisma migrate deploy` + seed on startup (web package `npm run start`).
echo "==> docker compose up -d app (runs migrations on startup)"
docker compose up -d --no-build app

echo "==> waiting for app to become healthy"
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' blog-react-app 2>/dev/null || echo missing)
  if [ "$status" = "healthy" ]; then
    echo "app is healthy"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "app did not become healthy in time; check 'docker compose logs app' before continuing" >&2
    exit 1
  fi
  sleep 2
done

echo "==> pruning old dangling images"
docker image prune -f

echo "==> done"
docker compose ps
