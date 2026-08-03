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

# Configuration from environment variables or defaults
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

def export_items_for_erpnext(output_file="erpnext_items_import.xlsx"):
    """
    Connects to SQL Server, extracts item details, and formats them
    for ERPNext Data Import tool.
    """
    try:
        logger.info(f"Connecting to SQL Server {SERVER}...")
        conn = pyodbc.connect(SQL_CONNECTION_STRING, timeout=10)
        
        # Query to fetch required and useful item details
        query = """
            WITH LastPurchase AS (
                SELECT ITD.ProductBatchID, 
                       ITM.VoucherType as last_purchase_type, 
                       ITM.TransactionDate as last_purchase_date, 
                       ITD.Quantity as last_purchase_qty, 
                       Pa.PartyName as last_purchase_supplier,
                       ROW_NUMBER() OVER (PARTITION BY ITD.ProductBatchID ORDER BY ITM.TransactionDate DESC, ITM.InvTransactionMasterID DESC) as rn
                FROM InvTransactionDetails ITD
                LEFT JOIN InvTransactionMaster ITM ON ITD.InvTransactionMasterID = ITM.InvTransactionMasterID
                LEFT JOIN Parties Pa ON ITM.LedgerID = Pa.LedgerID 
                WHERE ITM.VoucherType IN ('PI', 'PE')
            ),
            TransactionCheck AS (
                SELECT DISTINCT ITD.ProductBatchID
                FROM InvTransactionDetails ITD
                JOIN InvTransactionMaster ITM ON ITD.InvTransactionMasterID = ITM.InvTransactionMasterID
                WHERE ITM.TransactionDate >= '2021-01-01'
            )
            SELECT 
                P.ProductCode as [Item Code],
                P.ProductName as [Item Name],
                COALESCE(PG.GroupName, 'Products') as [Item Group],
                COALESCE(UOM.UnitName, 'Nos') as [Default Unit of Measure],
                CAST(PB.AutoBarcode AS VARCHAR(50)) as [Auto Barcode],
                P.ProductCode as [Manual Barcode],
                PB.StdSalesPrice as [Standard Selling Rate],
                PB.LastPurchaseCost as [Valuation Rate],
                PB.Stock as [Opening Stock],
                LP.last_purchase_date as [Last Purchase Date],
                LP.last_purchase_type as [Last Purchase Voucher Type],
                PB.LastPurchaseRate as [Purchase Price],
                PB.LastPurchaseCost as [Purchase Cost],
                PG.GroupName as [Category],
                PC.ProductCategoryName as [Sub Category],
                PB.MRP as [MRP],
                P.HSNCode as [HSN],
                (COALESCE(GST.Sales_SGSTPerc, 0) + COALESCE(GST.Sales_CGSTPerc, 0)) as [GST],
                LP.last_purchase_supplier as [Supplier Name],
                PB.IsActive as [Batch Status],
                PB.BatchNo as [Batch No],
                B.BrandName as [Brand],
                PB.MfgDate as [Manufacturing Date],
                PB.ExpiryDate as [Expiry Date],
                W.WarehouseName as [Warehouse],
                S.ShelfName as [Rack],
                Z.ZoneName as [Zone],
                CASE WHEN TC.ProductBatchID IS NULL THEN 'Yes' ELSE 'No' END as [No Transactions Since 2021]
            FROM ProductBatches PB
            LEFT JOIN Products P ON PB.ProductID = P.ProductID
            LEFT JOIN UnitOfMeasures UOM ON P.BasicUnitID = UOM.UnitID
            LEFT JOIN ProductGroups PG ON P.ProductGroupID = PG.ProductGroupID
            LEFT JOIN ProductCategory PC ON P.ProductCategoryID = PC.ProductCategoryID
            LEFT JOIN GSTCategory GST ON P.GSTTaxCategoryID = GST.GSTCategoryID 
            LEFT JOIN Brands B ON PB.BrandID = B.BrandID
            LEFT JOIN Shelfs S ON PB.ShelfID = S.ShelfID 
            LEFT JOIN Zone Z ON S.ZoneID = Z.ZoneID 
            LEFT JOIN Warehouses W ON PB.WarehouseID = W.WarehouseID
            LEFT JOIN LastPurchase LP ON PB.ProductBatchID = LP.ProductBatchID AND LP.rn = 1
            LEFT JOIN TransactionCheck TC ON PB.ProductBatchID = TC.ProductBatchID
            WHERE P.IsActive = 1 
              AND PB.AutoBarcode IS NOT NULL 
              AND LEN(CAST(PB.AutoBarcode AS VARCHAR(50))) = 6 
              AND ISNUMERIC(CAST(PB.AutoBarcode AS VARCHAR(50))) = 1
        """
        
        logger.info("Executing query to fetch items...")
        
        # Use pandas to read SQL directly into a DataFrame
        df = pd.read_sql(query, conn)
        
        # Format or clean up data if needed
        df['Item Code'] = df['Item Code'].astype(str)
        df['Auto Barcode'] = df['Auto Barcode'].astype(str)
        df['Manual Barcode'] = df['Manual Barcode'].astype(str)
        
        # Format date column correctly (remove timezone if any, make it standard excel date)
        if 'Last Purchase Date' in df.columns:
            df['Last Purchase Date'] = pd.to_datetime(df['Last Purchase Date']).dt.strftime('%Y-%m-%d')
        if 'Manufacturing Date' in df.columns:
            df['Manufacturing Date'] = pd.to_datetime(df['Manufacturing Date']).dt.strftime('%Y-%m-%d')
        if 'Expiry Date' in df.columns:
            df['Expiry Date'] = pd.to_datetime(df['Expiry Date']).dt.strftime('%Y-%m-%d')
        
        # Handle duplicates based on Item Code
        original_count = len(df)
        df = df.sort_values('Opening Stock', ascending=False).drop_duplicates(subset=['Item Code'])
        logger.info(f"Dropped {original_count - len(df)} duplicate items (based on Item Code). Unique items: {len(df)}")
        
        # Save to Excel
        logger.info(f"Saving to {output_file}...")
        df.to_excel(output_file, index=False)
        
        logger.info(f"Successfully exported {len(df)} items to {output_file}")
        logger.info("You can now upload this file to ERPNext Data Import for the 'Item' DocType.")
        
    except Exception as e:
        logger.error(f"Failed to export items: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    export_items_for_erpnext()
