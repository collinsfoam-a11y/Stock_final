import pytest
import sys
from unittest.mock import patch, MagicMock
from pathlib import Path

# Need to fake import backend.db.runtime etc., or we just test the class logic
from backend.middleware.projection_consistency_guard import ProjectionConsistencyGuardMiddleware


def test_resolve_script_command():
    app = MagicMock()
    middleware = ProjectionConsistencyGuardMiddleware(app)

    # Valid
    cmd = middleware._resolve_script_command("backfill_session_dashboard_projection")
    assert "backfill_session_dashboard_projection.py" in cmd[0]

    # Invalid - path traversal
    with pytest.raises(ValueError, match="Invalid script name"):
        middleware._resolve_script_command("../backfill")

    # Invalid - injection
    with pytest.raises(ValueError, match="Invalid script name"):
        middleware._resolve_script_command("backfill; ls")


@patch("subprocess.run")
def test_run_projection_repair_cycle_validation(mock_run):
    app = MagicMock()
    middleware = ProjectionConsistencyGuardMiddleware(app)

    # Valid run should not raise validation errors (mock handles execution)
    middleware._run_projection_repair_cycle()
    assert mock_run.call_count == 3

    for call in mock_run.call_args_list:
        cmd_args, cmd_kwargs = call
        cmd = cmd_args[0]
        assert cmd[0] == sys.executable
        assert str(Path(cmd[1]).resolve()).startswith(
            str((middleware.root / "backend" / "scripts").resolve())
        )
        assert cmd_kwargs.get("shell") is False
