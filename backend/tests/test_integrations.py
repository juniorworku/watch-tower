from backend.app.config import Settings
from backend.app.integrations import Integrations


def test_configured_drive_failure_falls_back_to_snapshot_without_leaking_tokens(monkeypatch):
    service = Integrations(Settings(integration_env={"GOOGLE_CLIENT_ID": "id", "GOOGLE_CLIENT_SECRET": "private-secret", "GOOGLE_REFRESH_TOKEN": "private-refresh"}))
    def unavailable(*args, **kwargs):
        raise RuntimeError("provider failure with private-secret")
    monkeypatch.setattr(service, "request", unavailable)
    vault = service.vault()
    assert vault["source"]["kind"] == "snapshot" and vault["files"]
    assert "private-secret" not in vault["source"]["warning"]
    assert service.vault() == vault  # caches the fallback to avoid repeated failures


def test_google_credentials_and_access_tokens_never_leave_the_adapter(monkeypatch):
    service = Integrations(Settings(integration_env={"GOOGLE_CLIENT_ID": "id", "GOOGLE_CLIENT_SECRET": "secret", "GOOGLE_REFRESH_TOKEN": "refresh"}))
    class FakeResponse:
        def json(self):
            return {"access_token": "private-access", "expires_in": 3600}
    calls = []
    def response(url, method="GET", **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()
    monkeypatch.setattr(service, "request", response)
    assert service.google_token() == "private-access"
    assert service.google_token() == "private-access"
    assert len(calls) == 1 and calls[0][1]["data"]["refresh_token"] == "refresh"
