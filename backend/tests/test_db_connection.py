import pytest
from unittest.mock import patch, MagicMock
from backend.utils.db_connection import SQLServerConnectionBuilder, ConnectionStringOptimizer


class TestSQLServerConnectionBuilder:
    @pytest.fixture
    def mock_pyodbc_drivers(self):
        with patch("pyodbc.drivers") as mock:
            yield mock

    @pytest.fixture
    def mock_pyodbc_connect(self):
        with patch("pyodbc.connect") as mock:
            yield mock

    def test_get_available_driver_preferred(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["SQL Server", "ODBC Driver 17 for SQL Server"]
        # Reset detected driver cache
        SQLServerConnectionBuilder._detected_driver = None

        driver = SQLServerConnectionBuilder.get_available_driver()
        assert driver == "ODBC Driver 17 for SQL Server"

    def test_get_available_driver_fallback(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["Some Random Driver", "SQL Server Native Client 11.0"]
        SQLServerConnectionBuilder._detected_driver = None

        driver = SQLServerConnectionBuilder.get_available_driver()
        assert driver == "SQL Server Native Client 11.0"

    def test_get_available_driver_generic_sql(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["Generic SQL Driver"]
        SQLServerConnectionBuilder._detected_driver = None

        driver = SQLServerConnectionBuilder.get_available_driver()
        assert driver == "Generic SQL Driver"

    def test_get_available_driver_none(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["Oracle Driver"]
        SQLServerConnectionBuilder._detected_driver = None

        driver = SQLServerConnectionBuilder.get_available_driver()
        assert driver is None

    def test_get_available_driver_exception(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.side_effect = Exception("Driver error")
        SQLServerConnectionBuilder._detected_driver = None

        driver = SQLServerConnectionBuilder.get_available_driver()
        assert driver is None

    def test_build_connection_string_success(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        conn_str = SQLServerConnectionBuilder.build_connection_string(
            host="localhost", database="testdb", user="sa", password="password"
        )

        assert "DRIVER={ODBC Driver 17 for SQL Server}" in conn_str
        assert "SERVER=localhost" in conn_str
        assert "DATABASE=testdb" in conn_str
        assert "UID=sa" in conn_str
        assert "PWD=password" in conn_str
        assert "Pooling=True" in conn_str

    def test_build_connection_string_windows_auth(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        conn_str = SQLServerConnectionBuilder.build_connection_string(
            host="localhost", database="testdb"
        )

        assert "Trusted_Connection=yes" in conn_str
        assert "UID=" not in conn_str

    def test_build_connection_string_with_port(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        conn_str = SQLServerConnectionBuilder.build_connection_string(
            host="localhost", database="testdb", port=1433
        )

        assert "SERVER=localhost,1433" in conn_str

    def test_build_connection_string_no_driver(self, mock_pyodbc_drivers):
        mock_pyodbc_drivers.return_value = []
        SQLServerConnectionBuilder._detected_driver = None

        with pytest.raises(RuntimeError):
            SQLServerConnectionBuilder.build_connection_string(host="localhost", database="testdb")

    def test_create_optimized_connection(self, mock_pyodbc_drivers, mock_pyodbc_connect):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_pyodbc_connect.return_value = mock_conn

        conn = SQLServerConnectionBuilder.create_optimized_connection(
            host="localhost", database="testdb"
        )

        assert conn == mock_conn
        mock_pyodbc_connect.assert_called_once()
        # Verify optimization settings
        assert mock_cursor.execute.call_count >= 5
        mock_cursor.execute.assert_any_call("SET ARITHABORT ON")

    def test_create_optimized_connection_optimization_fail(
        self, mock_pyodbc_drivers, mock_pyodbc_connect
    ):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = Exception("Optimization error")
        mock_conn.cursor.return_value = mock_cursor
        mock_pyodbc_connect.return_value = mock_conn

        # Should not raise exception, just log warning
        conn = SQLServerConnectionBuilder.create_optimized_connection(
            host="localhost", database="testdb"
        )

        assert conn == mock_conn

    def test_test_connection_success(self, mock_pyodbc_drivers, mock_pyodbc_connect):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None

        result = SQLServerConnectionBuilder.test_connection(host="localhost", database="testdb")

        assert result is True
        mock_pyodbc_connect.return_value.close.assert_called_once()

    def test_test_connection_fail(self, mock_pyodbc_drivers, mock_pyodbc_connect):
        mock_pyodbc_drivers.return_value = ["ODBC Driver 17 for SQL Server"]
        SQLServerConnectionBuilder._detected_driver = None
        mock_pyodbc_connect.side_effect = Exception("Connection failed")

        result = SQLServerConnectionBuilder.test_connection(host="localhost", database="testdb")

        assert result is False

    def test_is_connection_valid_true(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        assert SQLServerConnectionBuilder.is_connection_valid(mock_conn) is True
        mock_cursor.execute.assert_called_with("SELECT 1")

    def test_is_connection_valid_false(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = Exception("DB error")
        mock_conn.cursor.return_value = mock_cursor

        assert SQLServerConnectionBuilder.is_connection_valid(mock_conn) is False


class TestConnectionStringOptimizer:
    def test_optimize_existing_connection_string(self):
        original = "DRIVER={SQL Server};SERVER=localhost;DATABASE=testdb"
        optimized = ConnectionStringOptimizer.optimize_existing_connection_string(original)

        assert "Connection Timeout=30" in optimized
        assert "Pooling=True" in optimized
        assert "MARS Connection=True" in optimized
        assert "DRIVER={SQL Server}" in optimized

    def test_optimize_existing_connection_string_preserve_values(self):
        original = "DRIVER={SQL Server};Connection Timeout=60"
        optimized = ConnectionStringOptimizer.optimize_existing_connection_string(original)

        # Should preserve existing timeout
        assert "Connection Timeout=60" in optimized
