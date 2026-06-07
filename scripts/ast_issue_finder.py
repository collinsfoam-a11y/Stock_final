import ast
import os
from pathlib import Path

class IssueFinder(ast.NodeVisitor):
    def __init__(self, filename):
        self.filename = filename
        self.issues = []

    def report(self, node, message, severity="WARNING"):
        self.issues.append({
            "file": self.filename,
            "line": node.lineno,
            "message": message,
            "severity": severity
        })

    def visit_ExceptHandler(self, node):
        # Look for except Exception or except: without raise or logger
        if isinstance(node.type, ast.Name) and node.type.id == "Exception" or node.type is None:
            has_raise = False
            has_logger = False
            for child in ast.walk(node):
                if isinstance(child, ast.Raise):
                    has_raise = True
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Attribute):
                        if isinstance(child.func.value, ast.Name) and child.func.value.id == "logger":
                            has_logger = True
            if not has_raise and not has_logger:
                self.report(node, "Broad except clause (Exception) does not log or raise. Potential silent failure.", "HIGH")
        self.generic_visit(node)

    def visit_Assign(self, node):
        # Look for hardcoded secrets
        for target in node.targets:
            if isinstance(target, ast.Name):
                name = target.id.lower()
                if any(x in name for x in ["password", "secret", "token", "api_key"]):
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        val = node.value.value.lower()
                        if val not in ["", "password", "test", "dummy", "change_me"]:
                            self.report(node, f"Possible hardcoded secret assigned to '{target.id}'", "HIGH")
        self.generic_visit(node)

def analyze_directory(directory):
    all_issues = []
    for root, _, files in os.walk(directory):
        if 'tests' in root.split(os.sep) or 'test' in root.split(os.sep):
            continue
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    tree = ast.parse(content, filename=filepath)
                    finder = IssueFinder(filepath)
                    finder.visit(tree)
                    all_issues.extend(finder.issues)
                except Exception as e:
                    pass
    return all_issues

if __name__ == "__main__":
    issues = analyze_directory('backend')
    
    high_issues = [i for i in issues if i["severity"] == "HIGH"]
    other_issues = [i for i in issues if i["severity"] != "HIGH"]
    
    print(f"--- Found {len(high_issues)} HIGH risk issues ---")
    for issue in high_issues[:20]:
        print(f"{issue['file']}:{issue['line']} -> {issue['message']}")
        
    if len(high_issues) > 20:
        print(f"... and {len(high_issues) - 20} more.")
        
    print(f"--- Found {len(other_issues)} other issues ---")
