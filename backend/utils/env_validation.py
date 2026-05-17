"""
Environment Variable Validation Module

Validates critical environment variables on application startup.
Raises ValueError if required variables are missing or invalid.
"""

import os
import logging

logger = logging.getLogger(__name__)


def validate_environment() -> None:
    """
    Validate critical environment variables on startup.

    Raises:
        ValueError: If required environment variables are missing or invalid
    """
    errors = []

    # Required variables
    required_vars = {
        "MONGO_URL": "MongoDB connection string",
        "DB_NAME": "Database name",
        "JWT_SECRET": "JWT signing secret",
        "JWT_REFRESH_SECRET": "JWT refresh token secret",
        "PIN_SALT": "PIN hashing salt",
    }

    # Check required variables
    for var_name, description in required_vars.items():
        value = os.getenv(var_name)
        if not value:
            errors.append(f"Missing required environment variable: {var_name} ({description})")
        elif len(value) < 32 and var_name in ["JWT_SECRET", "JWT_REFRESH_SECRET", "PIN_SALT"]:
            errors.append(
                f"Environment variable {var_name} must be at least 32 characters for security"
            )

    # Check JWT secrets are different
    jwt_secret = os.getenv("JWT_SECRET")
    jwt_refresh_secret = os.getenv("JWT_REFRESH_SECRET")
    if jwt_secret and jwt_refresh_secret and jwt_secret == jwt_refresh_secret:
        errors.append("JWT_SECRET and JWT_REFRESH_SECRET must be different values for security")

    # Validate numeric variables
    port = os.getenv("PORT")
    if port:
        try:
            port_num = int(port)
            if port_num < 1 or port_num > 65535:
                errors.append(f"PORT must be between 1 and 65535, got {port_num}")
        except ValueError:
            errors.append(f"PORT must be a valid integer, got {port}")

    # Validate boolean-like variables
    bool_vars = {
        "FORCE_HTTPS": "Should be true or false",
        "STRICT_CSP": "Should be true or false",
        "RATE_LIMIT_ENABLED": "Should be true or false",
    }

    for var_name, description in bool_vars.items():
        value = os.getenv(var_name)
        if value and value.lower() not in ["true", "false", "1", "0", "yes", "no"]:
            errors.append(f"{var_name}: {description}")

    # Check for default/example values in production
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production":
        production_checks = {
            "JWT_SECRET": ["GENERATE_SECURE_SECRET", "default", "example"],
            "JWT_REFRESH_SECRET": ["GENERATE_DIFFERENT_SECURE_SECRET", "default", "example"],
            "PIN_SALT": ["default-salt", "example"],
        }

        for var_name, forbidden_values in production_checks.items():
            value = os.getenv(var_name, "")
            for forbidden in forbidden_values:
                if forbidden.lower() in value.lower():
                    errors.append(
                        f"{var_name} contains default/example value '{forbidden}'. "
                        "This is not secure for production. Generate a secure random string."
                    )

    # Report errors
    if errors:
        error_msg = "Environment variable validation failed:\n" + "\n".join(
            f"  - {e}" for e in errors
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info("Environment variable validation passed")


def get_env_summary() -> dict:
    """Return a summary of configured environment variables (for logging)."""
    return {
        "environment": os.getenv("ENVIRONMENT", "development"),
        "port": os.getenv("PORT", "8001"),
        "mongo_url_configured": bool(os.getenv("MONGO_URL")),
        "jwt_secret_configured": bool(os.getenv("JWT_SECRET")),
        "pin_salt_configured": bool(os.getenv("PIN_SALT")),
        "force_https": os.getenv("FORCE_HTTPS", "false") == "true",
        "strict_csp": os.getenv("STRICT_CSP", "false") == "true",
        "rate_limit_enabled": os.getenv("RATE_LIMIT_ENABLED", "true") == "true",
    }
