from backend.config import Settings


def test_settings_accept_legacy_env_aliases(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 40)
    monkeypatch.setenv("JWT_REFRESH_SECRET", "b" * 40)
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    monkeypatch.delenv("METRICS_ENABLED", raising=False)
    monkeypatch.setenv("ENABLE_METRICS", "false")

    settings = Settings()

    assert settings.CORS_ALLOW_ORIGINS == "https://app.example.com"
    assert settings.METRICS_ENABLED is False
