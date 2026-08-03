import pyodbc
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import settings
from backend.utils.db_connection import SQLServerConnectionBuilder


def test_sql_connection():
    print(f"Testing SQL Server connection using SQLServerConnectionBuilder...")
    print(f"Host: {settings.SQL_SERVER_HOST}")
    print(f"Port: {settings.SQL_SERVER_PORT}")
    print(f"Database: {settings.SQL_SERVER_DATABASE}")
    print(f"User: {settings.SQL_SERVER_USER}")

    try:
        driver = SQLServerConnectionBuilder.get_available_driver()
        print(f"Detected Driver: {driver}")

        is_connected = SQLServerConnectionBuilder.test_connection(
            host=settings.SQL_SERVER_HOST,
            port=settings.SQL_SERVER_PORT,
            database=settings.SQL_SERVER_DATABASE,
            user=settings.SQL_SERVER_USER,
            password=settings.SQL_SERVER_PASSWORD,
            timeout=5,
        )

        if is_connected:
            print("✅ Connection successful!")
        else:
            print("❌ Connection failed (test_connection returned False).")
            # Try once more with detailed catch
            conn_str = SQLServerConnectionBuilder.build_connection_string(
                host=settings.SQL_SERVER_HOST,
                port=settings.SQL_SERVER_PORT,
                database=settings.SQL_SERVER_DATABASE,
                user=settings.SQL_SERVER_USER,
                password=settings.SQL_SERVER_PASSWORD,
                timeout=5,
            )
            print(
                f"Attempting manual connect with: {conn_str.replace(settings.SQL_SERVER_PASSWORD or '', '****')}"
            )
            pyodbc.connect(conn_str)

    except Exception as e:
        print(f"❌ Error during connection test: {e}")


if __name__ == "__main__":
    test_sql_connection()
