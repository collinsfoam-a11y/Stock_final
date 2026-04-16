import hashlib
import os


def get_pin_lookup_hash(pin: str) -> str:
    """
    Generate a salted SHA-256 hash of the PIN for O(1) lookups.

    SECURITY UPDATE: Added salt to prevent rainbow table attacks.

    WARNING: This is valid for LOOKUP only.
    It MUST NOT be used for verification. Verification must still use
    the slow, salted hash (bcrypt/argon2) stored in `hashed_password` or `pin_hash`.

    Purpose:
    - Allows finding a user by PIN in O(1) time: db.users.find_one({"pin_lookup_hash": ...})
    - Avoids iterating over all users and checking slow hashes (O(N)).
    - CRITICAL: Salted hash prevents rainbow table attacks
    """
    # CRITICAL SECURITY FIX: Add salt to prevent rainbow table attacks
    pin_salt = os.getenv("PIN_SALT")
    if not pin_salt:
        raise ValueError(
            "PIN_SALT environment variable must be set for production use. "
            "Generate a secure random string and set it in your .env file."
        )
    salted_pin = f"{pin_salt}{pin}"
    return hashlib.sha256(salted_pin.encode("utf-8")).hexdigest()
