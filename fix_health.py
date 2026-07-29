with open("backend/app/routers.py", "r") as f:
    content = f.read()

# Replace the None registration of health_router
content = content.replace('        (registry.health_router, None, ["health"]),\n', '')

with open("backend/app/routers.py", "w") as f:
    f.write(content)
