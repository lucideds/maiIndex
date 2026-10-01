#!/usr/bin/env bash
# Asserts each export format declares a Content-Type Android won't rewrite the filename for.
# Android's FileUtils.splitFileName() appends the default extension for the declared MIME type
# when the name's extension doesn't map back to it, turning `Song.adx` into `Song.adx.zip`.
# Usage: scripts/export-headers-check.sh [base-url]   (default http://localhost:8763)
set -u
BASE="${1:-http://localhost:8763}"

check() {
  local format="$1" want_type="$2" want_ext="$3"
  local hdrs
  hdrs=$(curl -s -o /dev/null -D - -X POST "$BASE/api/export" \
    -H 'Content-Type: application/json' -d "{\"songIds\":[\"1\"],\"format\":\"$format\"}")

  local type name
  type=$(printf '%s' "$hdrs" | grep -i '^content-type:' | tr -d '\r' | awk '{print $2}')
  name=$(printf '%s' "$hdrs" | grep -io 'filename="[^"]*"' | tail -1 | tr -d '\r' | sed 's/.*filename="//;s/"$//')

  if [ "$type" = "$want_type" ] && [ "${name##*.}" = "$want_ext" ]; then
    echo "ok   $format -> $type, $name"
  else
    echo "FAIL $format -> type='$type' (want '$want_type'), name='$name' (want *.$want_ext)"
    return 1
  fi
}

fail=0
check astrodx application/x-adx adx || fail=1
check sonolus application/x-scp  scp || fail=1
check majdata application/zip   zip || fail=1
exit $fail