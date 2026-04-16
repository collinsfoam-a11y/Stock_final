"""
Shared database connection utilities to eliminate duplicate connection logic
"""

import logging
from typing import Optional

import pyodbc

logger = logging.getLogger(__name__)


class SQLServerConnectionBuilder:
    """Centralized SQL Server connection string builder and connection utilities"""

    # Try drivers in order of preference (newest to oldest)
    DRIVER_PRIORITY = [
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "SQL Server Native Client 11.0",
        "SQL Server",  # Legacy driver (usually installed by default on Windows)
    ]
    DEFAULT_TIMEOUT = 30
    _detected_driver: Optional[str] = None

    @classmethod
    def get_available_driver(cls) -> Optional[str]:
        """Detect and cache the best available ODBC driver"""
        if cls._detected_driver:
            return cls._detected_driver

        # Get list of installed drivers
        try:
            installed_drivers = [driver for driver in pyodbc.drivers()]
            logger.debug(f"Installed ODBC drivers: {installed_drivers}")

            # Try each driver in priority order
            for driver in cls.DRIVER_PRIORITY:
                if driver in installed_drivers:
                    cls._detected_driver = driver
                    logger.info(f"Selected ODBC driver: {driver}")
                    return driver

            # If no preferred driver found, try any SQL Server driver
            for driver in installed_drivers:
                if "sql" in driver.lower():
                    cls._detected_driver = driver
                    logger.info(f"Using available SQL driver: {driver}")
                    return driver

            logger.error("No SQL Server ODBC driver found!")
            return None
        except Exception as e:
            logger.error(f"Error detecting ODBC drivers: {e}")
            return None

    @staticmethod
    def build_connection_string(
        host: str,
        database: str,
        port: Optional[int] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        additional_params: dict[str, Optional[str]] = None,
    ) -> str:
        """
        Build optimized ODBC connection string with consistent parameters

        Args:
            host: Database server hostname/IP
            database: Database name
            port: Optional port number
            user: Optional username for SQL Server auth
            password: Optional password for SQL Server auth
            timeout: Connection timeout in seconds
            additional_params: Optional additional connection parameters

        Returns:
            Formatted ODBC connection string
        """
        server = f"{host},{port}" if port else host

        # Get the best available driver
        driver = SQLServerConnectionBuilder.get_available_driver()
        if not driver:
            raise RuntimeError(
                "No SQL Server ODBC driver installed. "
                "Please install 'ODBC Driver 17 for SQL Server' from Microsoft."
            )

        logger.debug(f"SQLServerConnectionBuilder using driver: {driver}")

        # Base connection string components with performance optimizations
        base_params = [
            f"DRIVER={{{driver}}}",
            f"SERVER={server}",
            f"DATABASE={database}",
            "TrustServerCertificate=yes",
            f"Connection Timeout={timeout}",
            f"Login Timeout={timeout}",
        ]

        # Only add advanced features for modern drivers
        if "ODBC Driver" in driver:
            base_params.extend(
                [
                    "Pooling=True",  # Enable connection pooling at driver level
                    "MARS Connection=True",  # Multiple Active Result Sets
                    "ApplicationIntent=ReadWrite",
                ]
            )

        # Authentication
        if user and password:
            base_params.extend(
                [
                    f"UID={user}",
                    f"PWD={password}",
                ]
            )
        else:
            # Windows Authentication
            base_params.append("Trusted_Connection=yes")

        # Add any additional parameters
        if additional_params:
            for key, value in additional_params.items():
                base_params.append(f"{key}={value}")

        conn_str = ";".join(base_params)
        logger.debug(f"Built connection string for {host}:{port or 'default'}/{database}")
        return conn_str

    @staticmethod
    def create_optimized_connection(
        host: str,
        database: str,
        port: Optional[int] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> pyodbc.Connection:
        """
        Create an optimized SQL Server connection with consistent settings

        Returns:
            Configured pyodbc connection

        Raises:
            pyodbc.Error: If connection fails
        """
        conn_str = SQLServerConnectionBuilder.build_connection_string(
            host=host,
            database=database,
            port=port,
            user=user,
            password=password,
            timeout=timeout,
        )

        conn = pyodbc.connect(conn_str, timeout=timeout)

        # Set connection attributes for performance
        conn.timeout = timeout

        # Optimize connection settings
        cursor = conn.cursor()
        try:
            # Enable fast execution settings
            cursor.execute("SET ARITHABORT ON")
            cursor.execute("SET ANSI_NULLS ON")
            cursor.execute("SET ANSI_PADDING ON")
            cursor.execute("SET ANSI_WARNINGS ON")
            cursor.execute("SET QUOTED_IDENTIFIER ON")
            cursor.commit()
        except Exception as e:
            logger.warning(f"Failed to set optimization settings: {e}")
        finally:
            cursor.close()

        logger.info(f"Successfully created optimized connection to {host}/{database}")
        return conn

    @staticmethod
    def test_connection(
        host: str,
        database: str,
        port: Optional[int] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = 5,
    ) -> bool:
        """
        Test if a connection can be established

        Returns:
            True if connection successful, False otherwise
        """
        try:
            conn = SQLServerConnectionBuilder.create_optimized_connection(
                host=host,
                database=database,
                port=port,
                user=user,
                password=password,
                timeout=timeout,
            )
            conn.close()
            return True
        except Exception as e:
            logger.debug(f"Connection test failed for {host}:{port or 'default'}/{database}: {e}")
            return False

    @staticmethod
    def is_connection_valid(conn: pyodbc.Connection) -> bool:
        """
        Check if an existing connection is still valid

        Args:
            conn: pyodbc connection to test

        Returns:
            True if connection is valid, False otherwise
        """
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            return True
        except Exception:
            return False


class ConnectionStringOptimizer:
    """Utility for optimizing existing connection strings"""

    @staticmethod
    def optimize_existing_connection_string(
        connection_string: str, connect_timeout: int = 30, command_timeout: int = 30
    ) -> str:
        """
        Add performance optimizations to an existing connection string

        Args:
            connection_string: Original connection string
            connect_timeout: Connection timeout in seconds
            command_timeout: Command timeout in seconds

        Returns:
            Optimized connection string
        """
        optimizations = {
            "Connection Timeout": str(connect_timeout),
            "Command Timeout": str(command_timeout),
            "Pooling": "True",
            "MARS Connection": "True",
        }

        # Parse existing connection string
        params = {}
        for param in connection_string.split(";"):
            if "=" in param:
                key, value = param.split("=", 1)
                params[key.strip()] = value.strip()

        # Add optimizations if not present
        for key, value in optimizations.items():
            if key not in params:
                params[key] = value

        # Rebuild connection string
        optimized_parts = [f"{key}={value}" for key, value in params.items() if value]
        optimized_string = ";".join(optimized_parts)

        logger.info("Connection string optimized with performance enhancements")
        return optimized_string
