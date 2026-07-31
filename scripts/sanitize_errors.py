import os
import re

API_DIR = "backend/api"
modified_count = 0

def process_file(filepath):
    global modified_count
    with open(filepath, "r") as f:
        content = f.read()

    # Pattern 1: raise HTTPException(status_code=500, detail=str(e)) from e
    # Pattern 2: raise HTTPException(status_code=500, detail=f"Failed to... {str(e)}") from e
    # We will replace any detail=.*str\(e\).* with detail="An internal error occurred." if status_code >= 500
    
    # We want to replace detail=... with detail="An internal error occurred" when str(e) is used inside the detail.
    # regex to match: raise HTTPException(status_code=(5\d\d|status.HTTP_5\w+), detail=[^)]*str\(e\)[^)]*)
    # Actually, simpler: replace detail=f"..." or detail=str(e) with detail="An internal error occurred." if it's a 500 error.
    
    # Let's match: raise HTTPException(status_code=..., detail=...) from e
    
    new_content = content
    
    # This regex looks for HTTPException calls with status_code 500/50x and str(e) or repr(e) in detail
    # It replaces the detail parameter with detail="An internal error occurred."
    
    def repl(m):
        status_part = m.group(1)
        # return the same start but with a sanitized detail
        return f'raise HTTPException(status_code={status_part}, detail="An internal error occurred")'

    # match: raise HTTPException(status_code=500, detail=...)
    # We need to handle multi-line maybe? Mostly it's single line.
    pattern = r'raise HTTPException\(\s*status_code=(5\d\d|status\.HTTP_5\w+)\s*,\s*detail=[^)]*(?:str\(e\)|repr\(e\))[^)]*\)'
    new_content = re.sub(pattern, repl, new_content)
    
    # match also: raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=...)
    
    if new_content != content:
        with open(filepath, "w") as f:
            f.write(new_content)
        print(f"Sanitized {filepath}")
        modified_count += 1

for root, _, files in os.walk(API_DIR):
    for file in files:
        if file.endswith(".py"):
            process_file(os.path.join(root, file))
            
print(f"Done. Modified {modified_count} files.")
