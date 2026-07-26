import json
import logging
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler("sync_bridge_agent.log")],
)
logger = logging.getLogger("SyncBridgeAgent")

try:
    from backend.config import settings
    from backend.services.sql_sync_service import _build_new_item_dict
    from backend.sql_server_connector import SQLServerConnector
except ImportError as e:
    logger.error(f"Failed to import backend modules: {e}")
    sys.exit(1)


class DateTimeEncoder(json.JSONEncoder):
    """JSON encoder for datetime objects"""

    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


def run_sync_loop():
    """Main sync loop"""
    logger.info("Initializing Sync Bridge Agent...")

    sql_host = settings.SQL_SERVER_HOST
    sql_db = settings.SQL_SERVER_DATABASE

    if not sql_host or not sql_db:
        logger.error(
            "SQL Server not configured. Please set SQL_SERVER_HOST and SQL_SERVER_DATABASE."
        )
        sys.exit(1)

    connector = SQLServerConnector()

    # API Target
    api_url = f"http://localhost:{settings.PORT}/api/erp/sync/batch"
    sync_key = settings.SYNC_API_KEY

    logger.info(f"Target API: {api_url}")

    while True:
        try:
            logger.info("Connecting to SQL Server...")
            connected = connector.connect(
                host=sql_host,
                port=settings.SQL_SERVER_PORT,
                database=sql_db,
                user=settings.SQL_SERVER_USER,
                password=settings.SQL_SERVER_PASSWORD,
            )

            if not connected:
                logger.error("Failed to connect to SQL Server. Retrying in 60s...")
                time.sleep(60)
                continue

            logger.info("Fetching items from SQL Server...")
            start_time = time.time()
            rows = connector.get_all_items()
            logger.info(f"Fetched {len(rows)} items in {time.time() - start_time:.2f}s")

            # Transform to ERPItem schema structure
            batch_payload = []
            now = datetime.now(timezone.utc).replace(tzinfo=None)

            for row in rows:
                try:
                    qty = float(row.get("stock_qty", 0.0))
                    # Use the shared logic to map fields
                    item_dict = _build_new_item_dict(row, qty, now)
                    batch_payload.append(item_dict)
                except Exception as e:
                    logger.warning(f"Skipping malformed item: {e}")

            # Send Batch to API
            logger.info(f"Pushing {len(batch_payload)} items to Cloud API...")

            # Serialize manually to handle datetimes
            json_data = json.dumps(batch_payload, cls=DateTimeEncoder)

            resp = requests.post(
                api_url,
                data=json_data,
                headers={"Content-Type": "application/json", "X-Sync-Token": sync_key},
                timeout=300,  # 5 minutes timeout for large batches
            )

            if resp.status_code == 200:
                data = resp.json()
                logger.info(f"Sync Success! Stats: {data.get('stats')}")
            else:
                logger.error(f"Sync Failed: {resp.status_code} - {resp.text[:200]}")

            connector.disconnect()

        except Exception as e:
            logger.exception(f"Unexpected error in sync loop: {e}")
            if connector.connection:
                connector.disconnect()

        # Wait for next interval
        interval = settings.ERP_SYNC_INTERVAL
        logger.info(f"Sleeping for {interval}s...")
        time.sleep(interval)


if __name__ == "__main__":
    run_sync_loop()
