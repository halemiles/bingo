#!/bin/sh
# Renders the auto-mode speed settings from environment variables into
# config.json, which the app fetches on load. Runs from the nginx image's
# /docker-entrypoint.d/ hook before nginx starts; a non-zero exit stops the
# container, so a bad value fails loudly instead of serving a broken config.
#
# Writes to a tmpfs so the container filesystem can stay read-only.

set -eu

out_dir="${BINGO_CONFIG_DIR:-/tmp/bingo}"
min="${AUTO_MIN_SECONDS:-3}"
max="${AUTO_MAX_SECONDS:-15}"
default="${AUTO_DEFAULT_SECONDS:-5}"
step="${AUTO_STEP_SECONDS:-1}"

fail() {
  echo "bingo: invalid auto speed config: $*" >&2
  exit 1
}

check_seconds() {
  name="$1"
  value="$2"
  case "$value" in
    '' | *[!0-9]*) fail "$name must be a whole number of seconds, got '$value'" ;;
  esac
  # Strip leading zeros ("08" -> 8) so later maths and JSON don't see octal.
  value="$(printf '%s' "$value" | sed 's/^0*//')"
  value="${value:-0}"
  [ "$value" -ge 1 ] || fail "$name must be at least 1, got '$value'"
  [ "$value" -le 3600 ] || fail "$name must be at most 3600, got '$value'"
  echo "$value"
}

min="$(check_seconds AUTO_MIN_SECONDS "$min")"
max="$(check_seconds AUTO_MAX_SECONDS "$max")"
default="$(check_seconds AUTO_DEFAULT_SECONDS "$default")"
step="$(check_seconds AUTO_STEP_SECONDS "$step")"

[ "$min" -le "$max" ] || fail "AUTO_MIN_SECONDS ($min) is greater than AUTO_MAX_SECONDS ($max)"
[ "$min" -le "$default" ] && [ "$default" -le "$max" ] ||
  fail "AUTO_DEFAULT_SECONDS ($default) must be between $min and $max"

mkdir -p "$out_dir"
printf '{"autoMinSeconds":%s,"autoMaxSeconds":%s,"autoDefaultSeconds":%s,"autoStepSeconds":%s}\n' \
  "$min" "$max" "$default" "$step" >"$out_dir/config.json.tmp"
mv "$out_dir/config.json.tmp" "$out_dir/config.json"

echo "bingo: auto speed ${min}-${max}s, default ${default}s, step ${step}s"
