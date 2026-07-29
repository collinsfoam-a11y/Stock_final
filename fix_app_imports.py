import re
import os
import subprocess

def run_cmd(cmd):
    return subprocess.check_output(cmd, shell=True).decode('utf-8')

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

print(f"Applying fixes for {len(dup_files)} components to app/ directory...")

for name, filepath in dup_files:
    # We will traverse all .ts/.tsx files in frontend/app and frontend/src
    for search_dir in ["frontend/app", "frontend/src"]:
        for root, _, files in os.walk(search_dir):
            for file in files:
                if file.endswith(".ts") or file.endswith(".tsx"):
                    fpath = os.path.join(root, file)
                    with open(fpath, "r") as f:
                        fcontent = f.read()
                    
                    pattern1 = r'import\s+' + name + r'\s+from\s+([\'"].*?[\'"])'
                    repl1 = r'import { ' + name + r' } from \1'
                    
                    new_fcontent = re.sub(pattern1, repl1, fcontent)
                    
                    if new_fcontent != fcontent:
                        with open(fpath, "w") as f:
                            f.write(new_fcontent)

print("App directory codemod complete.")
