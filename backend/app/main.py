from contextlib import asynccontextmanager
import sqlite3
import psycopg
from psycopg_pool import PoolTimeout, TooManyRequests
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from .config import Settings
from .domain import DomainError
from .integrations import Integrations
from .repository import create_repository
from .seed import build_seed, empty_state
from .routers import agents, cron, dashboard, integrations, session


def create_app(settings=None, repository=None):
    settings = settings or Settings.from_env()
    repository = repository or create_repository(settings, build_seed if settings.seed_snapshot else empty_state)

    @asynccontextmanager
    async def lifespan(app):
        try:
            repository.initialize()
            yield
        finally:
            repository.close()

    app = FastAPI(title="Watch Tower API", version="1.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.repository = repository
    app.state.integrations = Integrations(settings)

    @app.exception_handler(DomainError)
    async def domain_error(_request: Request, error: DomainError):
        return JSONResponse({"error": str(error)}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def request_error(_request: Request, error: RequestValidationError):
        # Avoid echoing submitted secrets or full request payloads in validation errors.
        return JSONResponse({"error": "Invalid request", "fields": [{"location": list(e["loc"]), "message": e["msg"]} for e in error.errors()]}, status_code=422)

    @app.exception_handler(ValidationError)
    async def schema_error(_request: Request, _error: ValidationError):
        return JSONResponse({"error": "Invalid template or request fields"}, status_code=422)

    @app.exception_handler(sqlite3.OperationalError)
    @app.exception_handler(PoolTimeout)
    @app.exception_handler(TooManyRequests)
    @app.exception_handler(psycopg.OperationalError)
    @app.exception_handler(psycopg.InterfaceError)
    async def storage_error(_request: Request, _error: Exception):
        return JSONResponse({"error": "Database unavailable or busy; retry this request"}, status_code=503)

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health", tags=["health"])
    def health():
        repository.read()
        return {"status": "ok", "service": "watchtower-backend"}

    for router in (session.router, agents.router, cron.router, dashboard.router, integrations.router):
        app.include_router(router)
    return app

app = create_app()
