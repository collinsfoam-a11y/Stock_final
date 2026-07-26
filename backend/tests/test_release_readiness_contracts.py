from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_release_workflow_does_not_soft_pass_blocking_quality_gates():
    workflow = (REPO_ROOT / ".github" / "workflows" / "main.yml").read_text(encoding="utf-8")

    assert "continue-on-error: true" not in workflow
    assert "Some tests failed" not in workflow
    assert "--grep-invert" not in workflow
    assert "E2E smoke test partially skipped" not in workflow


def test_production_env_template_uses_current_image_namespace_with_placeholder_tags():
    env_template = (REPO_ROOT / ".env.production.example").read_text(encoding="utf-8")

    assert "ghcr.io/mknoufi/" not in env_template
    assert "ghcr.io/collinsfoam-a11y/stock_final-backend:CHANGE_ME_IMAGE_TAG" in env_template
    assert "ghcr.io/collinsfoam-a11y/stock_final-nginx:CHANGE_ME_IMAGE_TAG" in env_template


def test_vulnerability_script_scans_pnpm_and_requires_backend_auditor():
    script = (REPO_ROOT / "scripts" / "check_vulnerabilities.sh").read_text(encoding="utf-8")

    assert "frontend/pnpm-lock.yaml" in script
    assert "pnpm audit" in script
    assert "pip-audit is not installed" not in script
    # Positively assert the backend auditor actually runs, so the contract fails
    # if the pip-audit invocation is removed (absence-only checks could pass even
    # with the whole backend scan deleted).
    assert "pip_audit" in script
    assert "backend/requirements.production.txt" in script


def test_deploy_validator_normalizes_crlf_env_values():
    script = (REPO_ROOT / "scripts" / "validate_deploy.sh").read_text(encoding="utf-8")

    assert "value=\"${value%$'\\r'}\"" in script


def test_pnpm_docker_builds_copy_workspace_config_before_frozen_install():
    dockerfiles = [
        REPO_ROOT / "nginx" / "Dockerfile",
        REPO_ROOT / "frontend" / "Dockerfile",
    ]

    for dockerfile in dockerfiles:
        contents = dockerfile.read_text(encoding="utf-8")
        workspace_copy_index = contents.index("pnpm-workspace.yaml")
        frozen_install_index = contents.index("--frozen-lockfile")

        assert workspace_copy_index < frozen_install_index


def test_frontend_runtime_uses_writable_nginx_pid_path():
    dockerfile = (REPO_ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")

    assert "pid        /tmp/nginx.pid;" in dockerfile


def test_production_nginx_runtime_uses_writable_pid_path():
    nginx_config = (REPO_ROOT / "nginx" / "nginx.conf").read_text(encoding="utf-8")

    assert "pid /tmp/nginx.pid;" in nginx_config
    assert "listen 443 ssl http2;" not in nginx_config
