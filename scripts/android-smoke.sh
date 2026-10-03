#!/usr/bin/env bash
# Smoke test run on a booted emulator: install the APK, launch it, check the game menu renders from the
# bundled assets, start a duel and make sure the app is still alive and did not crash.
# Usage: scripts/android-smoke.sh path/to/ArcaneDuel.apk
set -uo pipefail

APK="${1:?usage: android-smoke.sh <apk>}"
PKG=app.arcaneduel
UI=/tmp/ui.xml

dump() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml "$UI" >/dev/null 2>&1
}

fail() {
  echo "SMOKE FAIL: $1"
  adb exec-out screencap -p > smoke-fail.png 2>/dev/null || true
  echo "--- logcat (errors) ---"
  adb logcat -d '*:E' | tail -60
  echo "--- last UI dump ---"
  head -c 4000 "$UI" 2>/dev/null || true
  exit 1
}

wait_text() { # wait_text <regex> [tries]
  local tries="${2:-30}"
  for _ in $(seq 1 "$tries"); do
    dump
    if grep -Eq "$1" "$UI"; then return 0; fi
    sleep 2
  done
  return 1
}

tap_text() { # tap_text <text>: tap the centre of the first node whose text/content-desc contains it
  local xy
  xy=$(python3 - "$1" <<'PY'
import re, sys
import xml.etree.ElementTree as ET
want = sys.argv[1]
for n in ET.parse('/tmp/ui.xml').iter('node'):
    if want in (n.get('text') or '') or want in (n.get('content-desc') or ''):
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds') or '')
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            print((x1 + x2) // 2, (y1 + y2) // 2)
            break
PY
)
  [ -n "$xy" ] || return 1
  # shellcheck disable=SC2086
  adb shell input tap $xy
}

echo "== install =="
adb install -r "$APK" || fail "install failed"
adb shell pm list packages | grep -q "$PKG" || fail "package not installed"
echo "permissions requested by the app:"
adb shell dumpsys package "$PKG" | sed -n '/requested permissions:/,/install permissions:/p' | head -10

echo "== launch =="
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
wait_text "듀얼 시작" 40 || fail "the game menu did not render"
echo "menu rendered from the bundled assets"
adb exec-out screencap -p > smoke-menu.png || true

echo "== start a duel =="
tap_text "듀얼 시작" || fail "could not find the start button"
wait_text "턴 [0-9]" 40 || fail "the duel board did not appear"
echo "duel board rendered"
adb exec-out screencap -p > smoke-duel.png || true

echo "== health =="
adb shell pidof "$PKG" >/dev/null || fail "the app process is gone"
# Only crashes of our own app count. uiautomator (the UI dump tool) sometimes crashes on WebView nodes;
# that also logs "FATAL EXCEPTION" but with a bare PID and no "Process: <package>" line.
if adb logcat -d | grep -A3 "FATAL EXCEPTION" | grep -q "Process: $PKG"; then fail "the app crashed"; fi
echo "SMOKE OK"
