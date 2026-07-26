with open("backend/sql_server_connector.py", "r") as f:
    lines = f.readlines()

new_lines = []
in_target_try = False
for i, line in enumerate(lines):
    if line.startswith("        try:") and i+1 < len(lines) and "cursor = self.connection.cursor()" in lines[i+1]:
        in_target_try = True
        new_lines.append(line)
        new_lines.append("            with self._query_lock:\n")
        continue
    
    if in_target_try:
        if line.startswith("        except"):
            in_target_try = False
            new_lines.append(line)
        elif line.strip() == "":
            new_lines.append(line)
        elif line.startswith("            "):
            new_lines.append("    " + line)
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open("backend/sql_server_connector.py", "w") as f:
    f.writelines(new_lines)
