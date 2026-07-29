with open("backend/services/count_lines/write_core.py", "r") as f:
    content = f.read()

import re

def replacer(match):
    return """        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict):
                raise ValueError("insert_one payload requires a 'document' dictionary")
            # Use repository.save instead of collection.insert_one
            return await self._execute_authorized_write(
                lambda: repository.save(document)
            )"""

content = re.sub(
    r'        if operation == "insert_one":\n            document = payload\.get\("document"\)\n            if not isinstance\(document, dict\):\n                raise ValueError\("insert_one payload requires a \'document\' dictionary"\)\n            return await self\._execute_authorized_write\(\n                lambda: collection\.insert_one\(document, \*\*kwargs\)\n            \)',
    replacer,
    content
)

with open("backend/services/count_lines/write_core.py", "w") as f:
    f.write(content)
