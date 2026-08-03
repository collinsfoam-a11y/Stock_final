import os

test_files = [
    '/Users/noufi1/stk_final/Stock_final/frontend/src/components/ui/__tests__/EmptyState.test.tsx',
    '/Users/noufi1/stk_final/Stock_final/frontend/src/components/settings/__tests__/UserSettingsSections.test.tsx',
    '/Users/noufi1/stk_final/Stock_final/frontend/app/admin/__tests__/logs.offlineMode.test.tsx',
    '/Users/noufi1/stk_final/Stock_final/frontend/app/supervisor/__tests__/layout.offlineGate.test.tsx',
    '/Users/noufi1/stk_final/Stock_final/frontend/app/supervisor/__tests__/sessionDetail.offlineMode.test.tsx'
]

for file in test_files:
    if os.path.exists(file):
        with open(file, 'r') as f:
            content = f.read()
        
        # Replace `const { Text, AppTouchable, View } = require("react-native");` with proper mock
        content = content.replace('const { Text, AppTouchable, View } = require("react-native");', 
                                  'const { Text, View } = require("react-native");\n  const { AppTouchable } = require("@/components/ui/AppTouchable");')
        content = content.replace('const { Text, AppTouchable } = require("react-native");', 
                                  'const { Text } = require("react-native");\n  const { AppTouchable } = require("@/components/ui/AppTouchable");')
        content = content.replace('const { AppTouchable } = require("react-native");', 
                                  'const { AppTouchable } = require("@/components/ui/AppTouchable");')
                                  
        with open(file, 'w') as f:
            f.write(content)
        print(f"Fixed {file}")

