import re

with open("backend/app/routers.py", "r") as f:
    content = f.read()

# Find the _register_core_router_set function
start_idx = content.find("def _register_core_router_set(app: FastAPI, registry: RouterRegistry) -> None:")
end_idx = content.find("def _register_optional_router_set")

if start_idx != -1 and end_idx != -1:
    core_fn = content[start_idx:end_idx]
    
    lines = core_fn.split("\n")
    new_lines = []
    
    for line in lines:
        if "(registry." in line and ", None, " in line:
            # It's an unprefixed router like (registry.mapping_router, None, None),
            # We want to add it as is (for legacy aliases) AND add a new prefixed version.
            new_lines.append(line)  # Legacy
            # Replace prefix None with "/api"
            # Watch out for the tags arg. 
            # (registry.mapping_router, None, None) -> (registry.mapping_router, "/api", None)
            new_line = line.replace(", None, ", ', "/api", ', 1)
            # If the router name itself contains None, the regex might fail, but it doesn't here.
            new_lines.append(new_line) # New prefixed version
        else:
            new_lines.append(line)
            
    new_content = content[:start_idx] + "\n".join(new_lines) + content[end_idx:]
    
    with open("backend/app/routers.py", "w") as f:
        f.write(new_content)
    print("Routers updated successfully")
else:
    print("Could not find _register_core_router_set")
