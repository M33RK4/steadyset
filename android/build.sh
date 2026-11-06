#!/usr/bin/env bash
# Builds android/build/steadyset-unsigned.apk with the Android command-line tools alone (the app has
# no dependencies, so it doesn't need Gradle). Then run android/sign.ps1 to sign it with your key.
set -euo pipefail
cd "$(dirname "$0")"

VERSION_CODE=2
VERSION_NAME=2.0
MIN_SDK=24
# 34, not higher: from 35 up, Android ignores the bar colours this app sets and draws the page behind the bars
TARGET_SDK=34

SDK="${ANDROID_HOME:-$HOME/.android-sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
export JAVA_HOME="${JAVA_HOME:-$HOME/.jdks/temurin-17}"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf build
mkdir -p build/classes build/dex build/gen/app/vercel/steadyset/twa

"$BT/aapt2.exe" compile --dir res -o build/res.zip
"$BT/aapt2.exe" link -I "$JAR" --manifest AndroidManifest.xml --java build/gen \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -o build/resources.apk build/res.zip

cat > build/gen/app/vercel/steadyset/twa/BuildConfigVersion.java <<EOF
package app.vercel.steadyset.twa;

final class BuildConfigVersion {
    static final String NAME = "$VERSION_NAME";
}
EOF

# the stubs let javac compile lambdas, which d8 then turns into plain classes
BOOT="$(cygpath -w "$JAR");$(cygpath -w "$BT/core-lambda-stubs.jar")"
javac -nowarn -Xlint:none -source 8 -target 8 -bootclasspath "$BOOT" -d build/classes $(find src build/gen -name '*.java')
"$BT/d8.bat" --release --min-api "$MIN_SDK" --lib "$JAR" --output build/dex $(find build/classes -name '*.class')

cp build/resources.apk build/app.apk
(cd build/dex && "$BT/aapt.exe" add ../app.apk classes.dex > /dev/null)
"$BT/zipalign.exe" -f -p 4 build/app.apk build/steadyset-unsigned.apk
echo "Built android/build/steadyset-unsigned.apk ($(wc -c < build/steadyset-unsigned.apk) bytes)"
