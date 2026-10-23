import hashlib
import hmac
import secrets
import time
from fastapi import Request
from .domain import DomainError

COOKIE = "wt_session"
MAX_AGE = 7 * 24 * 3600


def normalized(value):
    value = value.strip()
    return value[1:-1] if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'" else value


def configured(settings):
    return bool(settings.password_hash.strip() or normalized(settings.password))


def secret(settings):
    return settings.password_hash.strip() or normalized(settings.password)


def check_password(settings, password):
    if settings.password_hash:
        try:
            prefix, salt, expected = settings.password_hash.strip().split("$")
            if prefix != "scrypt" or len(salt) != 32 or len(expected) != 128:
                return False
            actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
            return hmac.compare_digest(actual, bytes.fromhex(expected))
        except (ValueError, TypeError):
            return False
    return bool(normalized(settings.password)) and hmac.compare_digest(hashlib.sha256(password.encode()).digest(), hashlib.sha256(normalized(settings.password).encode()).digest())


def session_token(settings, expires=None):
    expiry = int(expires or (time.time() + MAX_AGE))
    nonce = secrets.token_hex(16)
    data = f"v2.{expiry}.{nonce}"
    signature = hmac.new(secret(settings).encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{data}.{signature}"


def valid_session(settings, token):
    if not configured(settings):
        return False
    try:
        version, expiry, nonce, signature = token.split(".")
        if version != "v2" or int(expiry) <= time.time() or int(expiry) > time.time() + MAX_AGE + 60:
            return False
        expected = hmac.new(secret(settings).encode(), f"{version}.{expiry}.{nonce}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
    except (ValueError, AttributeError):
        return False


def dashboard(request: Request):
    settings = request.app.state.settings
    if not configured(settings):
        raise DomainError("DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD is not set on the backend", 503)
    if not valid_session(settings, request.cookies.get(COOKIE, "")):
        raise DomainError("Unauthorized", 401)


def bearer(request):
    header = request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


def master(request: Request):
    expected = request.app.state.settings.master_key.strip()
    if not expected:
        raise DomainError("WATCHTOWER_API_KEY is not configured", 503)
    if not hmac.compare_digest(bearer(request), expected):
        raise DomainError("Invalid Bearer token", 401)


def agent_auth(request: Request, agent_id: str):
    supplied = bearer(request)
    settings = request.app.state.settings
    if supplied and settings.master_key.strip() and hmac.compare_digest(supplied, settings.master_key.strip()):
        return
    if not supplied:
        raise DomainError("Missing Bearer token", 401)
    agent = next((a for a in request.app.state.repository.read()["agents"] if a["id"] == agent_id), {})
    digest = hashlib.sha256(supplied.encode()).hexdigest()
    if not hmac.compare_digest(agent.get("credentialHash", ""), digest):
        raise DomainError("Invalid agent credential", 401)


def safe_next(value):
    return value if isinstance(value, str) and value.startswith("/") and not value.startswith(("//", "/\\")) and "\r" not in value and "\n" not in value else "/"
