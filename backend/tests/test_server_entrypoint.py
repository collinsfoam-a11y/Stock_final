from pathlib import Path
from unittest.mock import patch

import backend.server as server


def test_server_main_uses_shared_runtime_bootstrap():
    with patch("backend.server.run_server_main") as mock_run_server_main:
        server.main()

    mock_run_server_main.assert_called_once()
    kwargs = mock_run_server_main.call_args.kwargs
    assert kwargs["app_import_path"] == "backend.server:app"
    assert kwargs["settings"] is server.settings
    assert kwargs["logger"].name == "stock-verify"
    assert kwargs["project_root"] == Path(server.__file__).resolve().parent.parent
