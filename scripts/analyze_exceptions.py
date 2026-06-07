import ast
import os
import json

class ExceptionAnalyzer(ast.NodeVisitor):
    def __init__(self, filepath, lines):
        self.filepath = filepath
        self.lines = lines
        self.issues = []

    def visit_ExceptHandler(self, node):
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
                # Extract the try block content
                try_block = []
                parent = None
                # We don't have direct parent pointers in ast, but we can extract lines
                start_line = node.lineno
                self.issues.append({
                    "file": self.filepath,
                    "line": start_line,
                    "code_snippet": self.lines[start_line-3:start_line+2]
                })
        self.generic_visit(node)

def analyze_exceptions():
    all_issues = []
    for root, _, files in os.walk('backend'):
        if 'tests' in root.split(os.sep) or 'test' in root.split(os.sep):
            continue
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    content = "".join(lines)
                    tree = ast.parse(content, filename=filepath)
                    analyzer = ExceptionAnalyzer(filepath, lines)
                    analyzer.visit(tree)
                    all_issues.extend(analyzer.issues)
                except Exception as e:
                    pass
    
    with open('exception_analysis.json', 'w') as f:
        json.dump(all_issues, f, indent=2)
    print(f"Dumped {len(all_issues)} issues to exception_analysis.json")

if __name__ == "__main__":
    analyze_exceptions()
