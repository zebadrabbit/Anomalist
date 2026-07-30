#!/usr/bin/env bash
# Verifies the docs screenshots are real images, not deleted, truncated or
# placeholder files. Shared by ci.yml (pre-merge) and docs.yml (pre-deploy).
#
# The list comes from git rather than a hardcoded manifest, so adding a ninth
# screenshot needs no change here. A tracked-but-deleted file still appears in
# `git ls-files`, so the -s test catches it.
set -euo pipefail

MIN_BYTES=1000
MIN_COUNT=8

files=$(git ls-files 'docs/public/screenshots/*.png')
count=$(printf '%s' "$files" | grep -c . || true)

if [ "$count" -lt "$MIN_COUNT" ]; then
  echo "Expected at least $MIN_COUNT tracked screenshots, found $count."
  echo "Screenshots are referenced from docs/**; removing one breaks the site."
  exit 1
fi

for f in $files; do
  if [ ! -s "$f" ]; then
    echo "Screenshot missing or empty: $f"
    exit 1
  fi

  size=$(wc -c < "$f")
  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "Screenshot looks like a placeholder: $f ($size bytes, expected >= $MIN_BYTES)"
    exit 1
  fi
done

echo "Checked $count screenshots."
