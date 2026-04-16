import asyncio
import logging
import socket
from functools import partial
from types import ModuleType
from typing import Any, Optional

try:
    import zeroconf as _zeroconf_module

    _ZEROCONF_MODULE: Optional[ModuleType] = _zeroconf_module
except ImportError:  # pragma: no cover - depends on optional dependency
    _ZEROCONF_MODULE = None

Zeroconf: Any = _ZEROCONF_MODULE.Zeroconf if _ZEROCONF_MODULE is not None else None
ServiceInfo: Any = _ZEROCONF_MODULE.ServiceInfo if _ZEROCONF_MODULE is not None else None

logger = logging.getLogger(__name__)


class MDNSService:
    def __init__(self, service_name: str = "stock-verify", port: int = 8001):
        self.zeroconf = Zeroconf() if Zeroconf is not None else None
        self.service_name = service_name
        self.port = port
        self.info: Any = None

    async def register(self) -> None:
        if self.zeroconf is None or ServiceInfo is None:
            logger.info("zeroconf dependency not installed; skipping mDNS registration")
            return

        try:
            # Get local IP
            local_ip = self._get_local_ip()
            if not local_ip:
                logger.warning("Could not determine local IP for mDNS registration")
                return

            # Prepare service info
            # _http._tcp.local. is the service type
            desc = {"path": "/"}

            self.info = ServiceInfo(
                "_http._tcp.local.",
                f"{self.service_name}._http._tcp.local.",
                addresses=[socket.inet_aton(local_ip)],
                port=self.port,
                properties=desc,
                server=f"{self.service_name}.local.",
            )

            logger.info(
                f"Registering mDNS service: {self.service_name}.local. at {local_ip}:{self.port}"
            )

            # Run blocking registration in executor
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, partial(self.zeroconf.register_service, self.info)),
                timeout=3.0,
            )

        except TimeoutError:
            logger.warning("mDNS registration timed out; continuing without blocking startup")

        except Exception as e:
            logger.error(f"Failed to register mDNS service: {e}", exc_info=True)

    async def unregister(self) -> None:
        if self.info and self.zeroconf is not None:
            logger.info(f"Unregistering mDNS service: {self.service_name}")
            loop = asyncio.get_running_loop()
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(
                        None, partial(self.zeroconf.unregister_service, self.info)
                    ),
                    timeout=3.0,
                )
            except TimeoutError:
                logger.warning("mDNS unregistration timed out")

        if self.zeroconf is not None:
            self.zeroconf.close()

    def _get_local_ip(self) -> str:
        try:
            # Connect to a public DNS to determine the most appropriate local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"


# Global instance
mdns_service: Optional[MDNSService] = None


async def start_mdns(port: int = 8001) -> None:
    global mdns_service
    mdns_service = MDNSService(port=port)
    await mdns_service.register()


async def stop_mdns() -> None:
    if mdns_service:
        await mdns_service.unregister()
