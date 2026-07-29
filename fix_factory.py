with open("backend/app/factory.py", "r") as f:
    content = f.read()

# Remove the legacy liveness probes block
import re
content = re.sub(r'# Legacy Liveness Probes.*?app\.get\("/api/health/startup", include_in_schema=False\)\(health_check\)', '', content, flags=re.DOTALL)

with open("backend/app/factory.py", "w") as f:
    f.write(content)
