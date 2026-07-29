import re
import os
import subprocess

def run_cmd(cmd):
    return subprocess.check_output(cmd, shell=True).decode('utf-8')

# Run knip to get the list of duplicate exports
# Duplicate exports section in knip:
# Duplicate exports (55)
# Component|default    src/components/...
try:
    knip_out = run_cmd("cd frontend && npm run knip:check || true")
except:
    knip_out = ""

lines = knip_out.split('\n')
in_dups = False
dup_files = []

for line in lines:
    if line.startswith("Duplicate exports"):
        in_dups = True
        continue
    if in_dups:
        if not line.strip() or "|" not in line or "Configuration hints" in line:
            if "Configuration hints" in line:
                in_dups = False
            continue
        
        parts = line.strip().split()
        if len(parts) >= 2:
            names = parts[0]
            filepath = parts[-1]
            if "|default" in names:
                name = names.split("|")[0]
                dup_files.append((name, filepath))

print(f"Found {len(dup_files)} duplicate exports")

# For each duplicate, we will remove the `export default Name` line.
# But FIRST, we need to convert default imports to named imports across the codebase.
# e.g., import Name from ".../Name" -> import { Name } from ".../Name"

for name, filepath in dup_files:
    if not filepath.startswith("src/"):
        continue
    
    # 1. Find the file and remove 'export default Name'
    full_path = os.path.join("frontend", filepath)
    if not os.path.exists(full_path):
        continue
        
    with open(full_path, "r") as f:
        content = f.read()
        
    # Remove `export default Name;`
    content = re.sub(r'export\s+default\s+' + name + r'\s*;?', '', content)
    
    # Also if it's `export default function Name`, we change it to `export function Name`
    # (But usually it's `export const Name` and `export default Name`)
    with open(full_path, "w") as f:
        f.write(content)

    # 2. Find all default imports of this module and replace with named imports.
    # We will use grep to find them.
    # regex for default import: import\s+Name\s+from\s+['"][^'"]*Name['"]
    # We will do a generic regex replace across all .ts and .tsx files
    
    # Actually, a simpler regex for python traversing:
    # We will just traverse all .ts/.tsx files in frontend/src
    for root, _, files in os.walk("frontend/src"):
        for file in files:
            if file.endswith(".ts") or file.endswith(".tsx"):
                fpath = os.path.join(root, file)
                with open(fpath, "r") as f:
                    fcontent = f.read()
                
                # regex to match: import Name from "..."
                # replace with: import { Name } from "..."
                pattern1 = r'import\s+' + name + r'\s+from\s+([\'"].*?[\'"])'
                repl1 = r'import { ' + name + r' } from \1'
                
                # what if it's import Name, { Other } from "..."?
                # That's harder, but standard is `import Name from`
                new_fcontent = re.sub(pattern1, repl1, fcontent)
                
                if new_fcontent != fcontent:
                    with open(fpath, "w") as f:
                        f.write(new_fcontent)

print("Codemod complete.")
