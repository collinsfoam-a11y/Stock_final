# ruff: noqa: E402
import asyncio
import logging
import re
import sys
import threading
from pathlib import Path
from typing import Any, Optional, Sequence

import pyodbc
from tenacity import retry, stop_after_attempt, wait_exponential

from backend.db_mapping_config import SQL_TEMPLATES, get_active_mapping
from backend.utils.db_connection import SQLServerConnectionBuilder

# Add project root to path for direct execution (debugging)
# This allows the file to be run directly for testing/debugging
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

logger = logging.getLogger(__name__)


class DatabaseConnectionError(Exception):
    """Raised when database connection fails after all retry attempts."""

    pass


class DatabaseQueryError(Exception):
    """Raised when database query execution fails."""

    pass


class ERPReadOnlyViolation(DatabaseQueryError):
    """Raised when a non-read-only SQL query is blocked."""

    pass


class ERPQueryParameterError(DatabaseQueryError):
    """Raised when SQL query parameterization is invalid."""

    pass


class ItemNotFoundError(Exception):
    """Raised when requested item is not found in database."""

    pass


# Constants
DB_NOT_CONNECTED_MSG = "Not connected to database"
DISALLOWED_SQL_KEYWORDS = (
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "CREATE",
    "EXEC",
    "EXECUTE",
    "GRANT",
    "REVOKE",
)
DISALLOWED_SELECT_KEYWORDS = ("INTO",)
DISALLOWED_BATCH_TOKENS = ("GO",)


class SQLServerConnector:
    def __init__(self):
        self.connection = None
        self.config = None
        self.mapping = get_active_mapping()
        self.connection_methods = []  # Store tested connection methods
        self._query_lock = threading.Lock()
        self._async_semaphore = None  # Initialized in execute_query
        self.db_name = "E_MART_KITCHEN_CARE"

        # SQL Templates from central registry
        self.item_by_barcode_query = SQL_TEMPLATES["get_item_by_barcode"]
        self.all_items_query = SQL_TEMPLATES["get_all_items"]
        self.search_items_query = SQL_TEMPLATES["search_items"]
        self.item_batches_query = SQL_TEMPLATES["get_item_batches"]
        self.all_warehouses_query = SQL_TEMPLATES["get_all_warehouses"]
        self.all_zones_query = SQL_TEMPLATES["get_all_zones"]

        # Cache for optional dynamic SQL fragments
        self._optional_selects = ""
        self._optional_joins = ""
        self._metadata_loaded = False
        self._available_tables = set()

    def _reset_dynamic_metadata(self):
        """Reset cached optional select/join fragments."""
        self._optional_selects = ""
        self._optional_joins = ""
        self._metadata_loaded = False
        self._available_tables = set()

    def _ensure_dynamic_sql_fragments(self):
        """Detect optional tables/columns once per connection for richer item metadata."""
        if self._metadata_loaded or not self.connection:
            return

        try:
            self._load_schema_metadata()
            self._build_optional_selects_and_joins()
            self._metadata_loaded = True
            logger.info("✓ Dynamic SQL metadata initialized")
        except Exception as e:
            logger.warning(f"Could not load dynamic SQL metadata: {str(e)}")
            # Fallback to basic queries
            self._optional_selects = ""
            self._optional_joins = ""

    def _load_schema_metadata(self):
        """Snapshot available tables for optional joins."""
        cursor = self.connection.cursor()
        try:
            self._execute_readonly(cursor, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES")
            self._available_tables = {row[0].upper() for row in cursor.fetchall()}
        finally:
            cursor.close()

    def _get_table_columns(self, table_name: Optional[str]) -> dict[str, str]:
        """Return column map for table (lowercase -> actual)."""
        if not table_name or table_name.upper() not in self._available_tables:
            return {}

        cursor = self.connection.cursor()
        try:
            self._execute_readonly(
                cursor,
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?",
                (table_name,),
            )
            return {row[0].lower(): row[0] for row in cursor.fetchall()}
        finally:
            cursor.close()

    def _resolve_table_name(self, candidates: list[str]) -> Optional[str]:
        for name in candidates:
            if name.upper() in self._available_tables:
                return name
        return None

    def _resolve_column_name(self, columns: dict[str, str], candidates: list[str]) -> Optional[str]:
        for name in candidates:
            if name.lower() in columns:
                return columns[name.lower()]
        return None

    def _get_column_reference(
        self, alias: str, columns: dict[str, str], candidates: list[str]
    ) -> Optional[str]:
        col = self._resolve_column_name(columns, candidates)
        return f"{alias}.{col}" if col else None

    def _build_coalesce_expression(self, expressions: list[str], default: str = "0") -> str:
        valid = [e for e in expressions if e]
        if not valid:
            return default
        return f"COALESCE({', '.join(valid)}, {default})"

    def _build_sales_metadata(self):
        t_sales = self._resolve_table_name(["ProductSales", "Sales", "CurrentSales"])
        if not t_sales:
            return ""

        cols = self._get_table_columns(t_sales)
        ref_price = self._get_column_reference("S", cols, ["SalePrice", "MRP", "Price"])
        if ref_price:
            return f", {ref_price} AS SalesPrice"
        return ""

    def _build_brand_metadata(self):
        t_brand = self._resolve_table_name(["Brands", "Brand", "ProductBrands"])
        if not t_brand:
            return ""

        cols = self._get_table_columns(t_brand)
        name_ref = self._get_column_reference("B", cols, ["BrandName", "Name", "Description"])
        if name_ref:
            return f" LEFT JOIN {t_brand} B ON P.BrandID = B.BrandID", f", {name_ref} AS BrandName"
        return "", ""

    def _build_purchase_metadata(self):
        t_pur = self._resolve_table_name(["PurchaseDetails", "Purchase", "StockIn"])
        if not t_pur:
            return ""

        cols = self._get_table_columns(t_pur)
        ref_rate = self._get_column_reference("PUR", cols, ["PurchaseRate", "Cost", "Rate"])
        if ref_rate:
            return f", {ref_rate} AS PurchaseRate"
        return ""

    def _build_optional_selects_and_joins(self):
        selects = []
        joins = []

        # Sales info
        sales_sel = self._build_sales_metadata()
        if sales_sel:
            selects.append(sales_sel)

        # Brand info
        brand_join, brand_sel = self._build_brand_metadata()
        if brand_join:
            joins.append(brand_join)
            selects.append(brand_sel)

        # Purchase info
        pur_sel = self._build_purchase_metadata()
        if pur_sel:
            selects.append(pur_sel)

        self._optional_selects = "".join(selects)
        self._optional_joins = "".join(joins)

    def _apply_optional_sections(self, template: str) -> str:
        """Apply dynamic SQL fragments to the query template."""
        try:
            # Note: template uses {optional_columns} and {optional_joins}
            return template.format(
                optional_columns=self._optional_selects,
                optional_joins=self._optional_joins,
            )
        except (KeyError, IndexError, ValueError):
            return template

    def _build_query(self, template_name: str, **kwargs) -> str:
        """
        Build a query from a template, applying both dynamic metadata
        and custom keyword formatting.
        """
        template = SQL_TEMPLATES.get(template_name)
        if not template:
            raise ValueError(f"Template {template_name} not found")

        self._ensure_dynamic_sql_fragments()

        # Combine default optional sections with custom kwargs
        format_kwargs = {
            "optional_columns": self._optional_selects,
            "optional_joins": self._optional_joins,
            **kwargs,
        }

        try:
            return template.format(**format_kwargs)
        except Exception as e:
            logger.error(f"Error formatting query {template_name}: {e}")
            # Fallback to basic optional sections if custom format fails
            return self._apply_optional_sections(template)

    def _get_formatted_query(self, template_name: str) -> str:
        """Get a formatted query by template name."""
        return self._build_query(template_name)

    def _strip_sql_comments_and_literals(self, query: str) -> str:
        """Remove comments and string/identifier literals for safe keyword scanning."""
        # Remove block comments and line comments
        sanitized = re.sub(r"/\*.*?\*/", " ", query, flags=re.DOTALL)
        sanitized = re.sub(r"--.*?$", " ", sanitized, flags=re.MULTILINE)
        # Remove single-quoted literals (including N'...')
        sanitized = re.sub(r"N?'(?:''|[^'])*'", "''", sanitized)
        # Remove double-quoted identifiers/literals
        sanitized = re.sub(r'"(?:\"\"|[^"])*"', '""', sanitized)
        # Remove bracketed identifiers
        sanitized = re.sub(r"\[[^\]]*\]", "[]", sanitized)
        return sanitized

    def _assert_read_only_query(self, query: str) -> None:
        """Enforce ERP read-only policy at runtime for every SQL execution."""
        if not query or not isinstance(query, str):
            raise DatabaseQueryError("SQL query is empty or invalid")

        sanitized = self._strip_sql_comments_and_literals(query)
        normalized = re.sub(r"\s+", " ", sanitized).strip().upper()

        if not normalized:
            raise DatabaseQueryError("SQL query is empty after normalization")

        if not (normalized.startswith("SELECT ") or normalized.startswith("WITH ")):
            raise ERPReadOnlyViolation("ERP read-only violation: non-SELECT query blocked")

        if ";" in sanitized:
            raise ERPReadOnlyViolation("ERP read-only violation: multi-statement query blocked")

        for token in DISALLOWED_BATCH_TOKENS:
            if re.search(rf"\b{re.escape(token)}\b", normalized):
                raise ERPReadOnlyViolation("ERP read-only violation: batch separator blocked")

        for keyword in DISALLOWED_SQL_KEYWORDS:
            if re.search(rf"\b{re.escape(keyword)}\b", normalized):
                raise ERPReadOnlyViolation("ERP read-only violation: write keyword blocked")

        for keyword in DISALLOWED_SELECT_KEYWORDS:
            if re.search(rf"\b{re.escape(keyword)}\b", normalized):
                raise ERPReadOnlyViolation("ERP read-only violation: SELECT INTO blocked")

    def _validate_params(self, query: str, params: Optional[Sequence[Any]] = None) -> None:
        """Ensure parameterized queries use positional placeholders safely."""
        if params is None:
            if "?" in query:
                raise ERPQueryParameterError("SQL parameters missing for parameterized query")
            return

        param_count = len(params)
        placeholder_count = query.count("?")

        if param_count == 0:
            if placeholder_count > 0:
                raise ERPQueryParameterError("SQL parameters missing for parameterized query")
            return

        if placeholder_count == 0:
            raise ERPQueryParameterError("ERP read-only violation: unparameterized query blocked")

        if placeholder_count != param_count:
            raise ERPQueryParameterError("SQL parameter count mismatch for parameterized query")

    def _execute_readonly(self, cursor, query: str, params: Optional[Sequence[Any]] = None) -> None:
        """Execute a read-only SQL query with strict guards."""
        self._assert_read_only_query(query)
        self._validate_params(query, params)
        if params is None:
            cursor.execute(query)
        else:
            cursor.execute(query, params)

    @property
    def optional_columns_clause(self) -> str:
        """Return the optional columns fragment."""
        return self._optional_selects if self._optional_selects else ""

    @property
    def optional_joins_clause(self) -> str:
        """Return the optional joins fragment."""
        return self._optional_joins if self._optional_joins else ""

    def _build_column_list(self) -> str:
        """Build the list of columns for a SELECT query based on the mapping."""
        cols = []
        for alias, actual in self.mapping["items_columns"].items():
            cols.append(f"I.[{actual}] as [{alias}]")
        return ", ".join(cols)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=3),
        reraise=True,
    )
    def connect(
        self,
        host: str,
        port: int,
        database: str,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ) -> bool:
        """
        Connect to SQL Server (Polosys ERP)
        Supports both Windows Authentication and SQL Server Authentication
        Automatically tries multiple connection methods if initial attempt fails
        """
        # Cache provided configuration so background services can retry later if needed
        self.config = {
            "host": host,
            "port": port,
            "database": database,
        }
        if user:
            self.config["user"] = user
        if password:
            self.config["password"] = password

        methods_to_try = self._build_connection_methods(host, port, database, user, password)

        # Try each method
        last_error = None
        for method in methods_to_try:
            if self._attempt_connection_method(method):
                return True
            last_error = self._get_last_error_from_method(method)

        # Log all attempted methods
        error_msg = f"All {len(methods_to_try)} connection methods failed. Last error: {last_error or 'Unknown error'}"
        logger.error(error_msg)
        raise DatabaseConnectionError(error_msg)

    def _build_connection_methods(
        self,
        host: str,
        port: int,
        database: str,
        user: Optional[str],
        password: Optional[str],
    ) -> list[dict[str, Any]]:
        """Build list of connection methods to try"""
        host_variants = [host, host.upper(), host.lower(), host.capitalize()]
        methods_to_try = []

        if user and password:
            methods_to_try.extend(
                self._build_sql_auth_methods(host_variants, port, database, user, password)
            )
        else:
            methods_to_try.extend(self._build_windows_auth_methods(host_variants, port, database))

        return methods_to_try

    def _build_sql_auth_methods(
        self,
        host_variants: list[str],
        port: int,
        database: str,
        user: str,
        password: str,
    ) -> list[dict[str, Any]]:
        """Build SQL Server Authentication methods"""
        methods = []
        for h in set(host_variants):
            methods.append(
                {
                    "host": h,
                    "port": port,
                    "database": database,
                    "user": user,
                    "password": password,
                    "auth": "sql",
                    "name": f"SQL Auth: {h}:{port}",
                }
            )
            methods.append(
                {
                    "host": h,
                    "port": None,
                    "database": database,
                    "user": user,
                    "password": password,
                    "auth": "sql",
                    "name": f"SQL Auth: {h} (no port)",
                }
            )
        return methods

    def _build_windows_auth_methods(
        self, host_variants: list[str], port: int, database: str
    ) -> list[dict[str, Any]]:
        """Build Windows Authentication methods"""
        methods = []
        for h in set(host_variants):
            methods.append(
                {
                    "host": h,
                    "port": port,
                    "database": database,
                    "user": None,
                    "password": None,
                    "auth": "windows",
                    "name": f"Windows Auth: {h}:{port}",
                }
            )
            methods.append(
                {
                    "host": h,
                    "port": None,
                    "database": database,
                    "user": None,
                    "password": None,
                    "auth": "windows",
                    "name": f"Windows Auth: {h} (no port)",
                }
            )
        return methods

    def _attempt_connection_method(self, method: dict[str, Any]) -> bool:
        """Attempt connection using a specific method"""
        try:
            port_param = self._normalize_port_value(method.get("port"))

            self.connection = SQLServerConnectionBuilder.create_optimized_connection(
                host=str(method["host"]),
                database=str(method["database"]),
                port=port_param,
                user=str(method["user"]) if method.get("user") else None,
                password=str(method["password"]) if method.get("password") else None,
                timeout=15,
            )

            # Verify connection using shared utility
            if not SQLServerConnectionBuilder.is_connection_valid(self.connection):
                raise pyodbc.Error("Connection validation failed")

            # Success - store config and log
            self._reset_dynamic_metadata()
            self._store_successful_config(method)
            return True

        except Exception as e:
            logger.debug(f"❌ {method['name']} failed: {str(e)[:100]}")
            self.connection_methods.append(
                {"success": False, "method": method["name"], "error": str(e)}
            )
            return False

    def _normalize_port_value(self, port_value: Any) -> Optional[int]:
        """Normalize port value to proper type"""
        if port_value is None:
            return None
        elif isinstance(port_value, int):
            return port_value
        elif isinstance(port_value, str) and port_value.isdigit():
            return int(port_value)
        else:
            return None

    def _store_successful_config(self, method: dict[str, Any]) -> None:
        """Store successful connection configuration"""
        self.config = {
            "host": method["host"],
            "port": method.get("port"),
            "database": method["database"],
            "auth": method["auth"],
            "method_used": method["name"],
        }
        if method["user"]:
            self.config["user"] = method["user"]
            self.config["password"] = method["password"]

        logger.info(f"✅ Successfully connected using {method['name']}")
        self.connection_methods.append(
            {
                "success": True,
                "method": method["name"],
                "config": {k: v for k, v in self.config.items() if k != "password"},
            }
        )

    def _get_last_error_from_method(self, method: dict[str, Any]) -> Optional[str]:
        """Get last error from connection methods history"""
        for conn_method in reversed(self.connection_methods):
            if conn_method.get("method") == method["name"] and not conn_method.get("success"):
                error = conn_method.get("error")
                return str(error) if error is not None else None
        return None

    def disconnect(self):
        if self.connection:
            self.connection.close()
            self.connection = None
            logger.info("Disconnected from SQL Server")
        self._reset_dynamic_metadata()

    def test_connection(self) -> bool:
        """Test if connection is alive, reconnect if needed"""
        if not self.connection:
            logger.debug("No SQL Server connection available")
            return self._attempt_auto_reconnect()

        if self._validate_connection():
            return True

        # Connection lost, try to reconnect
        logger.debug("Connection test failed")
        return self._attempt_reconnect_on_failure()

    def _attempt_auto_reconnect(self) -> bool:
        """Attempt to auto-reconnect using saved config"""
        if not self.config:
            return False

        try:
            logger.info("Attempting to establish SQL Server connection from saved config...")
            return self._reconnect_with_config()
        except Exception as e:
            logger.debug(f"Auto-reconnect failed: {str(e)[:100]}")
            return False

    def _validate_connection(self) -> bool:
        """Validate if current connection is working"""
        if not self.connection:
            return False
        try:
            cursor = self.connection.cursor()
            self._execute_readonly(cursor, "SELECT 1")
            cursor.fetchone()
            cursor.close()
            return True
        except Exception:
            return False

    def _attempt_reconnect_on_failure(self) -> bool:
        """Attempt to reconnect when connection validation fails"""
        if not self.config:
            return False

        try:
            logger.warning("Connection lost, attempting to reconnect...")
            return self._reconnect_with_config()
        except DatabaseConnectionError as reconnect_error:
            logger.error(f"Reconnect failed: {str(reconnect_error)[:100]}")
            return False
        except Exception as reconnect_error:
            logger.error(f"Unexpected reconnect error: {str(reconnect_error)[:100]}")
            return False

    def _reconnect_with_config(self) -> bool:
        """Reconnect using saved configuration"""
        if not self.config or not isinstance(self.config, dict):
            return False

        host = str(self.config["host"])
        port = int(self.config.get("port", 1433))
        database = str(self.config["database"])
        user = self.config.get("user")
        password = self.config.get("password")
        self.connect(host, port, database, user, password)
        return True

    def _cursor_to_dict(self, cursor, row) -> dict[str, Any]:
        """Convert pyodbc row to dictionary"""
        if not cursor.description or not row:
            return {}
        columns = [column[0] for column in cursor.description]
        result = dict(zip(columns, row))

        # Synthesize image URL if item_name exists
        if "item_name" in result and result["item_name"]:
            # Use placehold.co for dynamic placeholder
            safe_name = result["item_name"].replace(" ", "+")
            result["image_url"] = f"https://placehold.co/400x400/e2e8f0/1e293b?text={safe_name}"

        return result

    def get_item_by_barcode(self, barcode: str) -> Optional[dict[str, Optional[Any]]]:
        """
        Fetch item from E_MART_KITCHEN_CARE ERP by barcode
        Searches in ProductBarcodes, ProductBatches, and Products tables
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()

            # Use the predefined query template with optional metadata
            query = self._get_formatted_query("get_item_by_barcode")

            logger.info(f"Searching for barcode: {barcode}")

            # Execute with barcode - query template has single %s placeholder
            self._execute_readonly(cursor, query, (barcode,))
            row = cursor.fetchone()

            if row:
                result = self._cursor_to_dict(cursor, row)
                cursor.close()
                logger.info(f"Found item: {result.get('item_name')}")
                return result
            else:
                cursor.close()
                logger.warning(f"No item found for barcode: {barcode}")
                return None

        except Exception as e:
            logger.error(f"Error fetching item by barcode: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch item by barcode: {str(e)}")

    def get_all_items(self) -> list[dict[str, Any]]:
        """
        Fetch all active items from E_MART_KITCHEN_CARE ERP
        Limited to 1000 items for performance
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            # Use threading lock to prevent concurrent query conflicts
            with self._query_lock:
                cursor = self.connection.cursor()
                query = self._get_formatted_query("get_all_items")

                self._execute_readonly(cursor, query)
                rows = cursor.fetchall()

                # Convert rows to dictionaries (before closing cursor)
                results = [self._cursor_to_dict(cursor, row) for row in rows]
                cursor.close()

            logger.info(f"Retrieved {len(results)} items from ERP")
            return results

        except Exception as e:
            logger.error(f"Error fetching all items: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch all items: {str(e)}")

    def search_items(self, search_term: str) -> list[dict[str, Any]]:
        """
        Search items by name, code, or alias
        Returns top 50 matching items
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()

            # Get the query template
            query = self._get_formatted_query("search_items")
            search_pattern = f"%{search_term}%"

            # Execute with all 10 parameters:
            # - 7 for WHERE clause
            # - 3 for ORDER BY CASE expressions
            self._execute_readonly(
                cursor,
                query,
                (
                    search_pattern,  # WHERE: ProductName LIKE
                    search_pattern,  # WHERE: ProductCode LIKE
                    search_pattern,  # WHERE: ItemAlias LIKE
                    search_pattern,  # WHERE: MannualBarcode LIKE
                    search_pattern,  # WHERE: PBC.Barcode LIKE
                    search_pattern,  # WHERE: AutoBarcode LIKE
                    search_pattern,  # WHERE: GroupName LIKE
                    search_pattern,  # ORDER BY: ProductName LIKE
                    search_pattern,  # ORDER BY: ProductCode LIKE
                    search_pattern,  # ORDER BY: ItemAlias LIKE
                ),
            )
            rows = cursor.fetchall()

            # Convert rows to dictionaries (before closing cursor)
            results = [self._cursor_to_dict(cursor, row) for row in rows]
            cursor.close()

            logger.info(f"Found {len(results)} items matching '{search_term}'")
            return results

        except Exception as e:
            logger.error(f"Error searching items: {str(e)}")
            raise DatabaseQueryError(f"Failed to search items: {str(e)}")

    def get_item_batches(self, item_identifier: str) -> list[dict[str, Any]]:
        """
        Get all batches for a specific item
        Useful for items with different MRPs, expiry dates, or locations
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()
            query = self._get_formatted_query("get_item_batches")

            self._execute_readonly(cursor, query, (item_identifier, item_identifier))
            rows = cursor.fetchall()

            # Convert rows to dictionaries (before closing cursor)
            results = [self._cursor_to_dict(cursor, row) for row in rows]
            cursor.close()

            logger.info(f"Found {len(results)} batches for item '{item_identifier}'")
            return results

        except Exception as e:
            logger.error(f"Error fetching item batches: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch item batches: {str(e)}")

    def get_item_by_code(self, item_code: str) -> Optional[dict[str, Optional[Any]]]:
        """
        Fetch item by item code using SQL template
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()

            # Use the predefined query template
            query = self._get_formatted_query("get_item_by_code")

            logger.info(f"Searching for item code: {item_code}")

            self._execute_readonly(cursor, query, (item_code,))
            row = cursor.fetchone()

            if row:
                result = self._cursor_to_dict(cursor, row)
                cursor.close()
                logger.info(f"Found item: {result.get('item_name')}")
                return result
            else:
                cursor.close()
                logger.warning(f"No item found for item code: {item_code}")
                return None

        except Exception as e:
            logger.error(f"Error fetching item by code: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch item by code: {str(e)}")

    def get_all_warehouses(self) -> list[dict[str, Any]]:
        """Fetch all warehouses from ERP"""
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()
            query = self._get_formatted_query("get_all_warehouses")
            self._execute_readonly(cursor, query)
            rows = cursor.fetchall()
            results = [self._cursor_to_dict(cursor, row) for row in rows]
            cursor.close()
            return results
        except Exception as e:
            logger.error(f"Error fetching warehouses: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch warehouses: {str(e)}")

    def get_all_zones(self) -> list[dict[str, Any]]:
        """Fetch all zones (floors) from ERP"""
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        try:
            cursor = self.connection.cursor()
            query = self._get_formatted_query("get_all_zones")
            self._execute_readonly(cursor, query)
            rows = cursor.fetchall()
            results = [self._cursor_to_dict(cursor, row) for row in rows]
            cursor.close()
            return results
        except Exception as e:
            logger.error(f"Error fetching zones: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch zones: {str(e)}")

    def get_items_by_codes(self, item_codes: list[str]) -> list[dict[str, Any]]:
        """
        Fetch multiple items by their item codes in a single query.
        This is much more efficient than calling get_item_by_code() multiple times.

        Args:
            item_codes: List of item codes to fetch (max 500 per call for safety)

        Returns:
            List of item dictionaries
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        if not item_codes:
            return []

        # Limit batch size to avoid query size issues
        item_codes = item_codes[:500]

        try:
            cursor = self.connection.cursor()
            mapping = self.mapping
            schema = mapping["query_options"].get("schema_name", "dbo")
            table_name = mapping["tables"]["items"]
            joins = "\n".join(mapping["query_options"].get("join_tables", []))
            additional_where = mapping["query_options"].get("where_clause_additions", "")
            code_column = mapping["items_columns"]["item_code"]
            columns = self._build_column_list()

            # Build IN clause with parameterized placeholders
            placeholders = ", ".join("?" for _ in item_codes)

            # Build query with IN clause using safe parameterization
            # Note: schema, table_name, and column names are validated internally
            query = f"""
                SELECT {columns}
                    {self.optional_columns_clause}
                FROM [{schema}].[{table_name}] I
                {joins}
                {self.optional_joins_clause}
                WHERE {code_column} IN ({placeholders})
                {additional_where}
            """

            self._execute_readonly(cursor, query, item_codes)
            rows = cursor.fetchall()
            results = [self._cursor_to_dict(cursor, row) for row in rows]
            cursor.close()

            logger.info(f"Retrieved {len(results)} items by codes (requested: {len(item_codes)})")
            return results

        except Exception as e:
            logger.error(f"Error fetching items by codes: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch items by codes: {str(e)}")

    def get_item_quantities_only(self, item_codes: list[str]) -> dict[str, float]:
        """
        Fetch ONLY quantities for specific items by item_code - minimal SQL load.
        Returns a dict mapping item_code -> stock_qty.

        Args:
            item_codes: List of item codes (ProductCode) to fetch quantities for

        Returns:
            Dict mapping item_code to total stock_qty
        """
        if not self.connection:
            raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        if not item_codes:
            return {}

        # Limit batch size
        item_codes = item_codes[:1000]

        try:
            # Use threading lock to prevent concurrent query conflicts
            with self._query_lock:
                cursor = self.connection.cursor()

                # Build minimal query - sum quantities by item_code from ProductBatches + Products
                placeholders = ", ".join("?" for _ in item_codes)

                # Safe parameterized query - user input is properly parameterized
                query = f"""
                    SELECT P.ProductCode as item_code, COALESCE(SUM(PB.Stock), 0) as stock_qty
                    FROM dbo.Products P
                    LEFT JOIN dbo.ProductBatches PB ON P.ProductID = PB.ProductID
                    WHERE P.ProductCode IN ({placeholders})
                    GROUP BY P.ProductCode
                """

                self._execute_readonly(cursor, query, item_codes)
                rows = cursor.fetchall()

                # Build result dict
                results = {}
                for row in rows:
                    item_code = str(row[0]) if row[0] is not None else ""
                    stock_qty = float(row[1]) if row[1] is not None else 0.0
                    if item_code:
                        results[item_code] = stock_qty

                cursor.close()

            logger.debug(f"Retrieved quantities for {len(results)} item codes")
            return results

        except Exception as e:
            logger.error(f"Error fetching item quantities by item code: {str(e)}")
            raise DatabaseQueryError(f"Failed to fetch item quantities by item code: {str(e)}")

    async def execute_query(
        self, query: str, params: Optional[list[Any]] = None
    ) -> list[dict[str, Any]]:
        """
        Execute an arbitrary SQL query and return results as a list of dictionaries.
        This is an async-compatible wrapper for synchronous pyodbc execution.
        Uses both threading lock AND asyncio semaphore to prevent concurrent queries.
        Args:
            query: The SQL query to execute.
            params: Optional list of parameters for the query.

        Returns:
            List of result dictionaries.
        """
        # Enforce read-only governance (no write statements allowed)
        if not self._is_read_only_query(query):
            raise DatabaseQueryError(
                "READ_ONLY violation: non-SELECT query blocked by governance policy"
            )

        if not self.connection:
            if not self._attempt_auto_reconnect():
                raise DatabaseConnectionError(DB_NOT_CONNECTED_MSG)

        # Enforce read-only behavior and parameter validation before execution
        self._assert_read_only_query(query)
        self._validate_params(query, params)

        # Initialize semaphore if not already done
        if self._async_semaphore is None:
            self._async_semaphore = asyncio.Semaphore(1)

        # Use semaphore to prevent concurrent async queries
        async with self._async_semaphore:
            try:
                # Use run_in_executor for async-friendly execution of synchronous pyodbc calls
                loop = asyncio.get_event_loop()

                def _execute():
                    # Use threading lock to prevent concurrent query conflicts
                    with self._query_lock:
                        cursor = self.connection.cursor()
                        try:
                            if params is None or len(params) == 0:
                                self._execute_readonly(cursor, query)
                            else:
                                self._execute_readonly(cursor, query, params)

                            rows = cursor.fetchall()
                            return [self._cursor_to_dict(cursor, row) for row in rows]
                        finally:
                            cursor.close()

                return await loop.run_in_executor(None, _execute)

            except Exception as e:
                logger.error(f"Error executing custom query: {str(e)}")
                raise DatabaseQueryError(f"Failed to execute custom query: {str(e)}")

    @staticmethod
    def _strip_sql_comments(query: str) -> str:
        """Remove SQL line and block comments for safe keyword inspection."""
        # Remove block comments /* ... */
        without_block = re.sub(r"/\\*.*?\\*/", " ", query, flags=re.DOTALL)
        # Remove line comments -- ...
        return re.sub(r"--.*?$", " ", without_block, flags=re.MULTILINE)

    @classmethod
    def _is_read_only_query(cls, query: str) -> bool:
        """
        Return True if the query is read-only (SELECT/CTE) and contains no write keywords.
        """
        if not query:
            return False
        cleaned = cls._strip_sql_comments(query)
        cleaned = cleaned.strip()
        if not cleaned:
            return False

        upper = cleaned.upper()
        # Reject any write keywords anywhere in the cleaned query
        if re.search(r"\\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE)\\b", upper):
            return False

        # Allow SELECT or CTEs that start with WITH
        return upper.startswith("SELECT") or upper.startswith("WITH")


# Global connector instance
sql_connector = SQLServerConnector()
