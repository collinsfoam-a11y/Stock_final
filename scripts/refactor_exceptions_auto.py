import json
import os
from collections import defaultdict
import re

def process_file(filepath, issues):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Sort issues in reverse order so line numbers don't shift during modifications
    issues.sort(key=lambda x: x['line'], reverse=True)

    imports_to_add = set()

    for issue in issues:
        line_idx = issue['line'] - 1
        # Check if the line is actually an except block
        if line_idx < len(lines) and 'except Exception' in lines[line_idx]:
            snippet = "".join(issue['code_snippet'])
            indent = lines[line_idx][:len(lines[line_idx]) - len(lines[line_idx].lstrip())]
            
            if 'ObjectId' in snippet:
                lines[line_idx] = lines[line_idx].replace('except Exception', 'except InvalidId')
                imports_to_add.add('from bson.errors import InvalidId\n')
            elif 'request.json()' in snippet:
                lines[line_idx] = lines[line_idx].replace('except Exception', 'except json.JSONDecodeError')
                imports_to_add.add('import json\n')
            elif 'float(' in snippet or 'int(' in snippet or '_as_float' in snippet or 'float_or_zero' in snippet:
                lines[line_idx] = lines[line_idx].replace('except Exception', 'except (TypeError, ValueError)')
            elif 'find_one' in snippet or 'update_one' in snippet or 'delete_one' in snippet or 'aggregate' in snippet:
                lines[line_idx] = lines[line_idx].replace('except Exception', 'except PyMongoError')
                imports_to_add.add('from pymongo.errors import PyMongoError\n')
            elif 'psutil' in snippet:
                lines[line_idx] = lines[line_idx].replace('except Exception', 'except (psutil.Error, OSError)')
                imports_to_add.add('import psutil\n')
            else:
                # If we don't have a specific exception, add logging
                if 'except Exception:' in lines[line_idx]:
                    lines[line_idx] = lines[line_idx].replace('except Exception:', 'except Exception as e:')
                    # Insert logger
                    lines.insert(line_idx + 1, f'{indent}    logger.warning("Caught broad exception: %s", e)\n')
                    imports_to_add.add('import logging\nlogger = logging.getLogger(__name__)\n')

    if imports_to_add:
        # Add imports at the top, after the first few docstrings or future imports
        insert_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('import ') or line.startswith('from '):
                insert_idx = i
                break
        
        # Don't add duplicate imports
        existing_imports = "".join(lines)
        for imp in imports_to_add:
            if imp.strip() not in existing_imports:
                lines.insert(insert_idx, imp)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)

def main():
    with open('exception_analysis.json', 'r') as f:
        issues = json.load(f)

    issues_by_file = defaultdict(list)
    for issue in issues:
        issues_by_file[issue['file']].append(issue)

    for filepath, file_issues in issues_by_file.items():
        try:
            process_file(filepath, file_issues)
            print(f"Processed {filepath} ({len(file_issues)} issues)")
        except Exception as e:
            print(f"Failed to process {filepath}: {e}")

if __name__ == "__main__":
    main()
