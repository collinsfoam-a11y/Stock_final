import pyodbc
conn_str = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=192.168.1.8,1433;DATABASE=E_MART_KITCHEN_CARE;UID=stockapp;PWD=StockApp123"
try:
    conn = pyodbc.connect(conn_str, timeout=3)
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 1 * FROM Items" ) 
    print("Success connecting to E_MART_KITCHEN_CARE")
except Exception as e:
    print("Error:", e)
