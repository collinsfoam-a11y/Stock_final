from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
JENKINSFILE = ROOT / "Jenkinsfile"


def test_jenkinsfile_exists() -> None:
    assert JENKINSFILE.exists(), "Expected a root Jenkinsfile for Jenkins orchestration."


def test_jenkinsfile_uses_canonical_repo_scripts() -> None:
    content = JENKINSFILE.read_text(encoding="utf-8")

    assert "./scripts/agent_ci.sh ci" in content
    assert "backend/Dockerfile" in content
    assert "nginx/Dockerfile" in content
    assert "./scripts/deploy_remote_compose.sh" in content
    assert "./scripts/post_deploy_smoke.sh" in content
