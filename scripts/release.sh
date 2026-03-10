#!/usr/bin/env bash
set -euo pipefail

# Automate version bump, tag, and push based on conventional commits.
# Usage: bash scripts/release.sh [patch|minor|major]
# If no argument is given, the bump type is inferred from commits since the last tag.

BUMP="${1:-}"

# --- Safety checks ---

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on the main branch (currently on '$BRANCH')" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean" >&2
  exit 1
fi

git fetch origin main --tags --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Error: local main is not in sync with origin/main" >&2
  echo "  local:  $LOCAL" >&2
  echo "  remote: $REMOTE" >&2
  exit 1
fi

# --- Bump type inference ---

if [[ -z "$BUMP" ]]; then
  LAST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo "")
  if [[ -z "$LAST_TAG" ]]; then
    echo "No previous v* tag found, defaulting to patch"
    BUMP="patch"
  else
    COMMITS=$(git log "$LAST_TAG"..HEAD --pretty=format:'%s%n%b')
    if echo "$COMMITS" | grep -qiE 'BREAKING CHANGE:|^[a-z]+(\(.*\))?!:'; then
      BUMP="major"
    elif echo "$COMMITS" | grep -qE '^feat(\(.*\))?:'; then
      BUMP="minor"
    else
      BUMP="patch"
    fi
  fi
fi

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Error: invalid bump type '$BUMP' (must be patch, minor, or major)" >&2
  exit 1
fi

# --- Bump, tag, push ---

echo "Bumping $BUMP version..."
npm version "$BUMP" -m "chore: bump version to %s" --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")

# Update version in marketing website
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s|<span class=\"footer-version\">v[^<]*</span>|<span class=\"footer-version\">v$NEW_VERSION</span>|" website/index.html
else
  sed -i "s|<span class=\"footer-version\">v[^<]*</span>|<span class=\"footer-version\">v$NEW_VERSION</span>|" website/index.html
fi

git add package.json website/index.html
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"

echo "Pushing to origin..."
git push origin main --tags

echo ""
echo "Released v$NEW_VERSION ($BUMP bump)"
echo "GitHub Actions release workflow will handle the rest."
