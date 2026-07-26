import re

stats = {"backend": 0, "frontend": 0, "config/scripts": 0, "reports": 0}

with open("local_vs_origin_diff.patch", "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if line.startswith("--- a/"):
            path = line[6:].strip()
            if path.startswith("backend/"):
                stats["backend"] += 1
            elif path.startswith("frontend/"):
                stats["frontend"] += 1
            elif path.startswith("reports/"):
                stats["reports"] += 1
            else:
                stats["config/scripts"] += 1

print("Files modified/deleted/added:")
print(f"- Frontend: {stats['frontend']} files")
print(f"- Backend: {stats['backend']} files")
print(f"- Reports: {stats['reports']} files")
print(f"- Config/Scripts: {stats['config/scripts']} files")
