#!/bin/bash
# o que a app faz ao abrir, num Android com Chrome
mkdir -p res
adb shell getprop ro.build.version.release > res/android.txt
adb shell pm list packages | grep -iE "chrome|webview" >> res/android.txt
adb shell dumpsys package com.android.chrome | grep -m2 versionName >> res/android.txt
adb install -r sites/tapmoss/tapmoss.apk > res/instalar.txt 2>&1
# a Chrome already set up, like on a real phone: no welcome screens
adb shell 'echo "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb logcat -c
adb shell am start -W -n com.tapmoss.app/.LauncherActivity > res/abrir.txt 2>&1
for t in 8 20 40; do sleep $((t==8?8:t==20?12:20)); adb exec-out screencap -p > res/ecra-$t.png
  adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity|ResumedActivity" | head -3 > res/atividade-$t.txt; done
adb logcat -d -v time > res/logcat-completo.txt
grep -E "AndroidRuntime|FATAL|tapmoss|TrustedWebActivity|browserhelper|LauncherActivity|TwaLauncher|DigitalAsset|chromium.*(ERROR|Uncaught|Console)|Origin|verif" res/logcat-completo.txt | tail -300 > res/logcat-importante.txt
ls -la res
