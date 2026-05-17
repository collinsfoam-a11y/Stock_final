import pyodbc
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import settings


def test_sql_connection():
    print(f"Testing SQL Server connection...")
    print(f"Host: {settings.SQL_SERVER_HOST}")
    print(f"Port: {settings.SQL_SERVER_PORT}")
    print(f"Database: {settings.SQL_SERVER_DATABASE}")
    print(f"User: {settings.SQL_SERVER_USER}")
    print(f"Driver: {settings.SQL_SERVER_DRIVER}")

    conn_str = (
        f"DRIVER={{{settings.SQL_SERVER_DRIVER}}};"
        f"SERVER={settings.SQL_SERVER_HOST},{settings.SQL_SERVER_PORT};"
        f"DATABASE={settings.SQL_SERVER_DATABASE};"
        f"UID={settings.SQL_SERVER_USER};"
        f"PWD={settings.SQL_SERVER_PASSWORD};"
        f"Connect Timeout=5;"
    )

    try:
        conn = pyodbc.connect(conn_str)
        print("✅ Connection successful!")
        conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")


if __name__ == "__main__":
    test_sql_connection()
