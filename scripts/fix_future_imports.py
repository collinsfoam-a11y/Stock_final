import os

def fix_future_imports(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    
                    future_lines = []
                    other_lines = []
                    
                    for line in lines:
                        if line.startswith('from __future__ import'):
                            future_lines.append(line)
                        else:
                            other_lines.append(line)
                            
                    if future_lines:
                        # Find the first line that is not a comment or docstring to insert future imports before other imports
                        # Actually, just putting it at the absolute top is safest.
                        new_lines = future_lines + other_lines
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.writelines(new_lines)
                except Exception as e:
                    pass

if __name__ == "__main__":
    fix_future_imports('backend')
