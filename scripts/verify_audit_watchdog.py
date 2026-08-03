import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
from backend.db.runtime import set_db, set_client
from backend.services.audit_service import AuditService, AuditEventType, AuditLogStatus
from backend.services.watchdog_service import WatchdogService


async def main():
    print("Verifying Audit & Watchdog Services...")

    # Initialize DB connection manually for script
    try:
        client = AsyncIOMotorClient(settings.MONGO_URL)
        db = client[settings.DB_NAME]
        set_client(client)
        set_db(db)
        print(f"   Connected to MongoDB: {settings.DB_NAME}")
    except Exception as e:
        print(f"   Failed to connect to DB: {e}")
        return

    audit_service = AuditService(db)
    watchdog = WatchdogService(db)

    # 1. Test Audit Logging
    print("1. Creating Audit Log...")
    log_id = await audit_service.log_event(
        event_type=AuditEventType.SYSTEM_ALERT,
        status=AuditLogStatus.SUCCESS,
        details={"message": "Verification Test Log", "test": True},
    )
    print(f"   Log created with ID: {log_id}")

    # 2. Verify Log Retrieval
    print("2. Retrieving Audit Log...")
    logs = await audit_service.get_logs(limit=1)
    if logs:
        print(f"   Log retrieval successful. ID: {logs[0].id}")
    else:
        print("   Log retrieval failed or empty.")

    # 3. Test Watchdog (Velocity)
    print("3. Testing Watchdog (Velocity)...")
    # Insert multiple logs effectively immediately to trigger velocity
    username = "test_velocity_user"
    for _ in range(15):
        await audit_service.log_event(
            event_type=AuditEventType.STOCK_COUNT_SUBMITTED,
            actor_username=username,
            actor_id="test_user_id",
            details={"test": True},
        )

    await watchdog.check_velocity_anomalies(time_window_seconds=60, max_count=10)

    # Check if alert was logged
    alerts = (
        await db.audit_logs.find(
            {
                "event_type": AuditEventType.SYSTEM_ALERT,
                "status": AuditLogStatus.WARNING,
                "details.details.username": username,  # Watchdog nests the anomaly details
            }
        )
        .sort("timestamp", -1)
        .to_list(1)
    )

    # Also check generic message search
    if not alerts:
        alerts = (
            await db.audit_logs.find(
                {
                    "event_type": AuditEventType.SYSTEM_ALERT,
                    "status": AuditLogStatus.WARNING,
                    "details.message": {"$regex": username},
                }
            )
            .sort("timestamp", -1)
            .to_list(1)
        )

    if alerts:
        print(
            f"   Watchdog correctly triggered alert: {alerts[0].get('details', {}).get('message')}"
        )
    else:
        print("   Watchdog FAILED to trigger alert.")

    print("\nVerification Complete.")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
