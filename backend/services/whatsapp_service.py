"""
WhatsApp message delivery with explicit provider behavior.

The previous implementation silently returned success in mock mode, which made
password-reset flows look healthy even when nothing was actually delivered.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class WhatsAppDeliveryError(RuntimeError):
    """Raised when WhatsApp delivery is unavailable or fails."""


class WhatsAppService:
    """
    Service for sending WhatsApp messages.

    Supported providers:
    - disabled: fail closed
    - mock: explicit development-only fake delivery
    - twilio: send via Twilio WhatsApp API
    """

    def __init__(self, config: Optional[dict] = None):
        env_config = {
            "WHATSAPP_PROVIDER": os.getenv("WHATSAPP_PROVIDER", "disabled"),
            "TWILIO_ACCOUNT_SID": os.getenv("TWILIO_ACCOUNT_SID"),
            "TWILIO_AUTH_TOKEN": os.getenv("TWILIO_AUTH_TOKEN"),
            "TWILIO_WHATSAPP_FROM": os.getenv("TWILIO_WHATSAPP_FROM"),
            "WHATSAPP_TIMEOUT_SECONDS": os.getenv("WHATSAPP_TIMEOUT_SECONDS", "10"),
        }
        self.config = {**env_config, **(config or {})}
        self.provider = str(self.config.get("WHATSAPP_PROVIDER", "disabled")).lower()
        self.timeout_seconds = float(self.config.get("WHATSAPP_TIMEOUT_SECONDS", 10))

    def is_delivery_configured(self) -> bool:
        """Return True only when the provider can actually deliver messages."""
        if self.provider == "twilio":
            return all(
                [
                    self.config.get("TWILIO_ACCOUNT_SID"),
                    self.config.get("TWILIO_AUTH_TOKEN"),
                    self.config.get("TWILIO_WHATSAPP_FROM"),
                ]
            )
        if self.provider == "mock":
            return True
        return False

    async def send_otp(self, phone_number: str, otp: str) -> bool:
        """Send an OTP code to a phone number."""
        message = f"Your Stock Verify verification code is: {otp}. It expires in 5 minutes."
        return await self._send_message(phone_number, message)

    async def send_password_reset_confirmation(self, phone_number: str) -> bool:
        """Send a confirmation message after successful password reset."""
        message = (
            "Your Stock Verify password has been successfully reset. "
            "If this wasn't you, please contact support immediately."
        )
        return await self._send_message(phone_number, message)

    async def _send_message(self, phone_number: str, message: str) -> bool:
        if self.provider == "mock":
            logger.warning(
                "\n--- [WHATSAPP MOCK DELIVERY] ---\n"
                "TO: %s\nMESSAGE: %s\nTIMESTAMP: %s\n-------------------------------\n",
                phone_number,
                message,
                datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            )
            return True

        if self.provider == "twilio":
            return await self._send_via_twilio(phone_number, message)

        raise WhatsAppDeliveryError("WhatsApp delivery is not configured")

    async def _send_via_twilio(self, phone_number: str, message: str) -> bool:
        if not self.is_delivery_configured():
            raise WhatsAppDeliveryError("Twilio WhatsApp credentials are incomplete")

        account_sid = str(self.config["TWILIO_ACCOUNT_SID"])
        auth_token = str(self.config["TWILIO_AUTH_TOKEN"])
        from_number = self._format_whatsapp_number(str(self.config["TWILIO_WHATSAPP_FROM"]))
        to_number = self._format_whatsapp_number(phone_number)
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                url,
                auth=(account_sid, auth_token),
                data={"From": from_number, "To": to_number, "Body": message},
            )

        if response.status_code >= 400:
            logger.error(
                "Twilio WhatsApp delivery failed",
                extra={
                    "status_code": response.status_code,
                    "response_body": response.text[:500],
                },
            )
            raise WhatsAppDeliveryError("WhatsApp provider rejected the message")

        logger.info("WhatsApp message delivered via Twilio", extra={"to": to_number})
        return True

    @staticmethod
    def _format_whatsapp_number(phone_number: str) -> str:
        normalized = phone_number.strip()
        if normalized.startswith("whatsapp:"):
            return normalized
        return f"whatsapp:{normalized}"
