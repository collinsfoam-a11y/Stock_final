#!/usr/bin/env bash
set -euo pipefail

xcrun simctl shutdown all >/dev/null 2>&1 || true
rm -rf ~/Library/Developer/Xcode/DerivedData

pod deintegrate || true
pod cache clean --all || true
pod repo update

if [ -f Gemfile ]; then
  bundle install
  bundle exec pod install
else
  pod install
fi

open LavanyaMartStockVerify.xcworkspace || open *.xcworkspace
echo "Done. Build from the .xcworkspace."
