import os
import glob
import re

frontend_dir = '/Users/noufi1/stk_final/Stock_final/frontend'
exclude_file = 'src/components/ui/AppTouchable.tsx'

files_to_check = []
for root_dir in ['src', 'app']:
    for path, subdirs, files in os.walk(os.path.join(frontend_dir, root_dir)):
        for name in files:
            if name.endswith('.tsx') or name.endswith('.ts'):
                full_path = os.path.join(path, name)
                if exclude_file not in full_path:
                    files_to_check.append(full_path)

for file in files_to_check:
    with open(file, 'r') as f:
        content = f.read()
    
    if 'TouchableOpacity' in content:
        new_content = content.replace('TouchableOpacity', 'AppTouchable')
        # Also need to make sure AppTouchable is imported if it's not
        if 'AppTouchable' in new_content and 'import { AppTouchable }' not in new_content:
             # Let's see if we need to add import
             new_content = 'import { AppTouchable } from "@/components/ui/AppTouchable";\n' + new_content
             
        with open(file, 'w') as f:
            f.write(new_content)
        print(f"Fixed {file}")

