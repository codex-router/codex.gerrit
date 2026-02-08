#!/bin/bash

set -e

echo "==> Checking disk space..."
df -h

echo "==> Cleaning Docker resources to free up space..."
docker system prune -af --volumes

echo "==> Using slim Dockerfile to reduce disk usage..."
export DOCKER_BUILDKIT=1

docker build \
    --file Dockerfile.slim \
    --tag gerrit-plugins-codex:slim \
    --progress=plain \
    .

echo "==> Extracting plugin..."
docker run -it -d --name gerrit-plugins-codex-slim gerrit-plugins-codex:slim
docker cp gerrit-plugins-codex-slim:/workspace/output/codex.jar .
docker rm -f gerrit-plugins-codex-slim

echo "==> Build complete!"
ls -lh codex.jar

echo "==> Cleaning up..."
docker builder prune -af

df -h
