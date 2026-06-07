import os
import re

def analyze_frontend(directory):
    issues = []
    
    # regex patterns
    empty_catch_pattern = re.compile(r'catch\s*\([^)]*\)\s*\{\s*\}')
    console_log_pattern = re.compile(r'console\.(log|debug|info)\(')
    secret_pattern = re.compile(r'(?i)(password|secret|token|api_key)\s*[:=]\s*["\']([^"\']{4,})["\']')
    
    for root, _, files in os.walk(directory):
        if 'node_modules' in root.split(os.sep) or '.pnpm' in root.split(os.sep) or '.next' in root.split(os.sep):
            continue
            
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        
                    content = "".join(lines)
                    
                    # Check empty catch
                    for match in empty_catch_pattern.finditer(content):
                        line_num = content[:match.start()].count('\n') + 1
                        issues.append({
                            'file': filepath,
                            'line': line_num,
                            'message': 'Empty catch block (silent failure)',
                            'severity': 'HIGH'
                        })
                        
                    for i, line in enumerate(lines):
                        # Check console.log
                        if console_log_pattern.search(line):
                            issues.append({
                                'file': filepath,
                                'line': i + 1,
                                'message': 'console.log left in code',
                                'severity': 'LOW'
                            })
                            
                        # Check hardcoded secrets
                        match = secret_pattern.search(line)
                        if match:
                            val = match.group(2).lower()
                            if val not in ["", "password", "test", "dummy", "change_me", "bearer"]:
                                issues.append({
                                    'file': filepath,
                                    'line': i + 1,
                                    'message': f"Possible hardcoded secret assigned to '{match.group(1)}'",
                                    'severity': 'HIGH'
                                })
                except Exception as e:
                    pass
                    
    return issues

if __name__ == "__main__":
    issues = analyze_frontend('frontend')
    
    high_issues = [i for i in issues if i["severity"] == "HIGH"]
    other_issues = [i for i in issues if i["severity"] != "HIGH"]
    
    print(f"--- Found {len(high_issues)} HIGH risk issues in frontend ---")
    for issue in high_issues[:20]:
        print(f"{issue['file']}:{issue['line']} -> {issue['message']}")
        
    if len(high_issues) > 20:
        print(f"... and {len(high_issues) - 20} more.")
        
    print(f"--- Found {len(other_issues)} LOW risk issues in frontend ---")
    for issue in other_issues[:5]:
        print(f"{issue['file']}:{issue['line']} -> {issue['message']}")
