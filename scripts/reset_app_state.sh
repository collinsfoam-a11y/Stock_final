#!/bin/bash

echo "🔄 Resetting app state..."

# clear local storage (web)
rm -rf ~/.config/google-chrome/Default/Local\ Storage || true

# clear expo cache
cd frontend
npx expo start -c

echo "✅ App state reset"
