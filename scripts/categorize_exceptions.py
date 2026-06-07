import json
from collections import defaultdict

with open('exception_analysis.json', 'r') as f:
    issues = json.load(f)

# Group by the try block content roughly
groups = defaultdict(list)
for issue in issues:
    snippet = "".join(issue['code_snippet'])
    if 'ObjectId' in snippet:
        groups['ObjectId_cast'].append(issue)
    elif 'request.json()' in snippet:
        groups['request_json'].append(issue)
    elif 'float(' in snippet or 'int(' in snippet or 'float_or_zero' in snippet or '_as_float' in snippet:
        groups['numeric_cast'].append(issue)
    elif 'datetime' in snippet or 'fromisoformat' in snippet or 'strptime' in snippet:
        groups['datetime_parse'].append(issue)
    elif 'find_one' in snippet or 'update_one' in snippet or 'delete_one' in snippet or 'aggregate' in snippet:
        groups['mongo_query'].append(issue)
    else:
        groups['other'].append(issue)

print("--- EXCEPTION GROUPS ---")
for k, v in groups.items():
    print(f"{k}: {len(v)} instances")
