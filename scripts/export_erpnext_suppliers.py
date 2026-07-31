import pyodbc
import pandas as pd
import os
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration from environment variables
SERVER = os.getenv("SQL_SERVER_HOST", "192.168.1.8")
PORT = os.getenv("SQL_SERVER_PORT", "1433")
DATABASE = os.getenv("SQL_SERVER_DATABASE", "E_MART_KITCHEN_CARE")
USER = os.getenv("SQL_SERVER_USER", "stockapp")
PASSWORD = os.getenv("SQL_SERVER_PASSWORD", "StockApp123")

SQL_CONNECTION_STRING = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USER};"
    f"PWD={PASSWORD};"
    f"TrustServerCertificate=yes;"
)

def export_suppliers_for_erpnext(output_file="Supplier.xlsx"):
    """
    Connects to SQL Server, extracts supplier details, and formats them
    for ERPNext Data Import tool.
    """
    try:
        logger.info(f"Connecting to SQL Server {SERVER}...")
        conn = pyodbc.connect(SQL_CONNECTION_STRING, timeout=10)
        
        # Query to fetch supplier details
        query = """
            SELECT 
                PartyName as [Supplier Name],
                'All Supplier Groups' as [Supplier Group],
                'Company' as [Supplier Type],
                Email as [Email Address],
                MobilePhone as [Mobile No],
                OfficePhone as [Phone],
                Address1 as [Address Line 1],
                Address2 as [Address Line 2],
                StateName as [State],
                GSTNo as [GSTIN],
                PANNo as [PAN],
                TaxNumber as [Tax ID],
                CSTNumber as [CST Number],
                BankName as [Bank Name],
                Accountnumber as [Bank Account No],
                IFSC_Code as [Bank IFSC Code]
            FROM Parties
            WHERE PartyType = 'Supp' AND IsActive = 1
        """
        
        logger.info("Executing query to fetch suppliers...")
        
        # Use pandas to read SQL directly into a DataFrame
        df = pd.read_sql(query, conn)
        
        # Handle duplicates based on Supplier Name if necessary
        original_count = len(df)
        df = df.drop_duplicates(subset=['Supplier Name'])
        logger.info(f"Dropped {original_count - len(df)} duplicate suppliers. Unique suppliers: {len(df)}")
        
        # Save to Excel
        logger.info(f"Saving to {output_file}...")
        df.to_excel(output_file, index=False)
        
        logger.info(f"Successfully exported {len(df)} suppliers to {output_file}")
        
    except Exception as e:
        logger.error(f"Failed to export suppliers: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    export_suppliers_for_erpnext()
