#!/usr/bin/env bash
set -euo pipefail

kind="${1:?evidence kind required}"
target_sha="${2:?target sha required}"
source_dir="${3:?source directory required}"

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
: "${R2_ENDPOINT_URL:?R2_ENDPOINT_URL is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"

R2_BUCKET="${R2_BUCKET:-hive-repositories}"

case "$kind" in
  dast|council) ;;
  *) echo "::error::Unsupported evidence kind: $kind"; exit 1 ;;
esac

[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Target SHA must be an exact 40-character commit SHA."
  exit 1
}

test -d "$source_dir" || {
  echo "::error::Evidence directory does not exist: $source_dir"
  exit 1
}
test -f "$source_dir/evidence.json" || {
  echo "::error::Evidence directory must contain evidence.json"
  exit 1
}

prefix="repository-evidence/${GITHUB_REPOSITORY}/${kind}/${target_sha}/run-${GITHUB_RUN_ID}/attempt-${GITHUB_RUN_ATTEMPT}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

aws s3 cp "$source_dir/" "s3://${R2_BUCKET}/${prefix}/" \
  --recursive \
  --endpoint-url "$R2_ENDPOINT_URL" \
  --only-show-errors

verified=0
while IFS= read -r -d '' file; do
  relative="${file#"$source_dir"/}"
  aws s3api head-object \
    --bucket "$R2_BUCKET" \
    --key "$prefix/$relative" \
    --endpoint-url "$R2_ENDPOINT_URL" >/dev/null
  verified=$((verified + 1))
done < <(find "$source_dir" -type f -print0)

test "$verified" -gt 0 || {
  echo "::error::No evidence files were available for R2 verification."
  exit 1
}

printf 'R2 evidence persisted and verified: s3://%s/%s/ (%s files)\n' "$R2_BUCKET" "$prefix" "$verified"
