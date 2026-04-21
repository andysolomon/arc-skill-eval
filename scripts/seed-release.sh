#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_TAG="v0.1.0"

if git rev-parse "$TARGET_TAG" >/dev/null 2>&1; then
  echo "$TARGET_TAG already exists"
  exit 0
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "No commits found. Create the initial commit before seeding the release tag."
  exit 1
fi

git tag -a "$TARGET_TAG" -m "chore(release): seed 0.1.0"
echo "Created $TARGET_TAG"
echo "Push it with: git push origin $TARGET_TAG"
