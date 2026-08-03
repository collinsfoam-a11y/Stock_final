from backend.error_messages import ERROR_MESSAGES


def _sanitize_detail(status_code: int) -> str:
    # Map status codes to error keys
    code_map = {
        400: "VAL_INVALID_INPUT",
        401: "AUTH_INVALID_CREDENTIALS",
        403: "AUTHZ_INSUFFICIENT_PERMISSIONS",
        404: "RES_NOT_FOUND",
        429: "SRV_RATE_LIMIT",
        500: "SRV_INTERNAL_ERROR",
        503: "DB_CONNECTION_FAILED",
    }
    
    error_key = code_map.get(status_code, "UNKNOWN_ERROR")
    error = ERROR_MESSAGES.get(
        error_key,
        ERROR_MESSAGES["UNKNOWN_ERROR"]
    )
    
    return str(error["detail"])