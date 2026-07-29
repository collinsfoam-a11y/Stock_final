import re
with open("backend/core/lifespan.py", "r") as f:
    content = f.read()

auth_func = """
async def _init_auth(db_instance):
    from backend.config import settings
    from backend.db.initialization import init_default_users, init_mock_erp_data
    import logging
    logger = logging.getLogger("stock-verify")
    try:
        if getattr(settings, "AUTO_SEED_DEFAULT_USERS", False):
            await init_default_users(db_instance)
            logger.info("OK: Default users initialized")
        else:
            logger.info("Default user seeding disabled")

        if getattr(settings, "AUTO_SEED_MOCK_ERP_DATA", False):
            await init_mock_erp_data(db_instance)
            logger.info("OK: Mock ERP data check complete")
        else:
            logger.info("Mock ERP data seeding disabled")
    except Exception as e:
        logger.warning(
            f"Could not initialize optional seed data (may be due to MongoDB unavailability): {str(e)}"
        )
"""

auth_block_pattern = re.compile(
    r"\s+# Optional bootstrap seeding for controlled dev/test environments only\.\s+"
    r"try:\s+"
    r"if getattr\(settings, \"AUTO_SEED_DEFAULT_USERS\", False\):\s+"
    r"await init_default_users\(db\)\s+"
    r"logger\.info\(\"OK: Default users initialized\"\)\s+"
    r"else:\s+"
    r"logger\.info\(\"Default user seeding disabled\"\)\s+"
    r"if getattr\(settings, \"AUTO_SEED_MOCK_ERP_DATA\", False\):\s+"
    r"await init_mock_erp_data\(db\)\s+"
    r"logger\.info\(\"OK: Mock ERP data check complete\"\)\s+"
    r"else:\s+"
    r"logger\.info\(\"Mock ERP data seeding disabled\"\)\s+"
    r"except Exception as e:\s+"
    r"logger\.warning\(\s*"
    r"f\"Could not initialize optional seed data \(may be due to MongoDB unavailability\): \{str\(e\)\}\"\s*"
    r"\)"
)

if auth_block_pattern.search(content):
    content = auth_block_pattern.sub(r"\n    # Optional bootstrap seeding for controlled dev/test environments only.\n    await _init_auth(db)\n", content)
    
    # insert auth_func before lifespan
    content = content.replace("async def lifespan(app: FastAPI):", auth_func + "\nasync def lifespan(app: FastAPI):")

    with open("backend/core/lifespan.py", "w") as f:
        f.write(content)
    print("Success")
else:
    print("Failed to find auth block")
