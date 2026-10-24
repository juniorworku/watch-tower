import hmac
from fastapi import APIRouter, Request
from ..auth import bearer
from ..domain import DomainError, tick_schedules

router = APIRouter(tags=["schedules"])

@router.get("/api/cron")
def tick(request: Request):
    expected = request.app.state.settings.cron_secret.strip()
    if not expected:
        raise DomainError("CRON_SECRET is not configured", 503)
    if not hmac.compare_digest(expected, bearer(request)):
        raise DomainError("Unauthorized", 401)
    from ..channels import dispatch
    schedules = request.app.state.repository.mutate(tick_schedules)
    return {**schedules, "deliveries": dispatch(request.app.state.repository, request.app.state.settings)}
