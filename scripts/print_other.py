import json

with open('exception_analysis.json', 'r') as f:
    issues = json.load(f)

print("--- OTHER EXCEPTIONS ---")
count = 0
for issue in issues:
    snippet = "".join(issue['code_snippet'])
    if 'ObjectId' not in snippet and 'request.json()' not in snippet and 'float(' not in snippet and 'int(' not in snippet and 'find_one' not in snippet and 'update_one' not in snippet and 'delete_one' not in snippet and 'aggregate' not in snippet and '_as_float' not in snippet and 'float_or_zero' not in snippet:
        print(f"{issue['file']}:{issue['line']}")
        print(snippet)
        print("-" * 40)
        count += 1
        if count >= 10:
            break
