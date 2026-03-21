from pathlib import Path
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_health_check_summary_runs_under_cp1252_console():
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"

    result = subprocess.run(
        [sys.executable, "scripts/health_check_summary.py"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert "UnicodeEncodeError" not in combined_output


def test_final_system_validation_script_uses_lf_line_endings():
    script_bytes = (REPO_ROOT / "scripts" / "final_system_validation.sh").read_bytes()
    assert b"\r\n" not in script_bytes


class _ValidationHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in {"/api/health", "/docs", "/"}:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


def test_final_system_validation_can_probe_local_http_server(tmp_path):
    server = ThreadingHTTPServer(("127.0.0.1", 0), _ValidationHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        port = server.server_port
        command = (
            f"BACKEND_URL='http://127.0.0.1:{port}' "
            f"FRONTEND_URL='http://127.0.0.1:{port}' "
            "./scripts/final_system_validation.sh"
        )

        result = subprocess.run(
            ["bash", "-lc", command],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
    finally:
        server.shutdown()
        server.server_close()

    combined_output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, combined_output
