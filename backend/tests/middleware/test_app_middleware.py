from types import SimpleNamespace

import pytest
from fastapi import FastAPI

from backend.app.middleware import _register_trusted_host_middleware


def test_register_trusted_host_middleware_requires_allowed_hosts_outside_dev():
    app = FastAPI()
    logger = SimpleNamespace(info=lambda *args, **kwargs: None, warning=lambda *args, **kwargs: None)

    with pytest.raises(RuntimeError, match="ALLOWED_HOSTS must be configured"):
        _register_trusted_host_middleware(
            app,
            allowed_hosts=[],
            env="production",
            logger=logger,
        )
