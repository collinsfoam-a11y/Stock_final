from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.app.settings_runtime import run_server_main


def test_run_server_main_http_disables_uvicorn_default_log_config(monkeypatch):
    logger = MagicMock()
    settings = SimpleNamespace(PORT=8001)
    project_root = Path("/tmp/project")

    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.setenv("DISABLE_SSL", "true")

    with (
        patch("backend.utils.env_validation.validate_environment"),
        patch("backend.utils.env_validation.get_env_summary", return_value={"mode": "test"}),
        patch(
            "backend.app.settings_runtime.PortDetector.find_available_port",
            return_value=8010,
        ),
        patch("backend.app.settings_runtime.PortDetector.get_local_ip", return_value="127.0.0.1"),
        patch("backend.app.settings_runtime.save_backend_info"),
        patch("backend.app.settings_runtime.uvicorn.run") as mock_run,
    ):
        run_server_main(
            app_import_path="backend.app_factory:app",
            settings=settings,
            logger=logger,
            project_root=project_root,
        )

    mock_run.assert_called_once_with(
        "backend.app_factory:app",
        host="127.0.0.1",
        port=8010,
        reload=False,
        log_level="info",
        access_log=True,
        log_config=None,
    )


def test_run_server_main_https_disables_uvicorn_default_log_config(monkeypatch):
    logger = MagicMock()
    settings = SimpleNamespace(PORT=8001)
    project_root = Path("/tmp/project")

    monkeypatch.setenv("HOST", "127.0.0.1")
    monkeypatch.delenv("DISABLE_SSL", raising=False)

    with (
        patch("backend.utils.env_validation.validate_environment"),
        patch("backend.utils.env_validation.get_env_summary", return_value={"mode": "test"}),
        patch(
            "backend.app.settings_runtime.PortDetector.find_available_port",
            return_value=8011,
        ),
        patch("backend.app.settings_runtime.PortDetector.get_local_ip", return_value="127.0.0.1"),
        patch("backend.app.settings_runtime.save_backend_info"),
        patch("backend.app.settings_runtime.os.path.exists", return_value=True),
        patch("backend.app.settings_runtime.uvicorn.run") as mock_run,
    ):
        run_server_main(
            app_import_path="backend.app_factory:app",
            settings=settings,
            logger=logger,
            project_root=project_root,
        )

    _, kwargs = mock_run.call_args
    assert kwargs["host"] == "127.0.0.1"
    assert kwargs["port"] == 8011
    assert kwargs["access_log"] is True
    assert kwargs["log_config"] is None
    assert kwargs["ssl_keyfile"] == str(project_root / "nginx" / "ssl" / "privkey.pem")
    assert kwargs["ssl_certfile"] == str(project_root / "nginx" / "ssl" / "fullchain.pem")
