import pytest

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


@pytest.mark.parametrize(
    ("jwt_secret", "refresh_secret"),
    [
        (
            "CHANGE_ME_TO_A_LONG_RANDOM_SECRET",
            "CHANGE_ME_TO_A_LONG_RANDOM_REFRESH_SECRET",
        ),
        (
            "CHANGE_ME_TO_A_LONG_RANDOM_SECRET_1234567890",
            "CHANGE_ME_TO_A_LONG_RANDOM_REFRESH_SECRET_1234567890",
        ),
    ],
)
def test_production_placeholders_are_rejected(monkeypatch, jwt_secret, refresh_secret):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", jwt_secret)
    monkeypatch.setenv("JWT_REFRESH_SECRET", refresh_secret)

    with pytest.raises(ValueError, match="known insecure default value"):
        Settings()
