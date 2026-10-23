from fastapi import APIRouter, Depends, Request
from ..auth import dashboard

router = APIRouter(prefix="/api", tags=["integrations"], dependencies=[Depends(dashboard)])

@router.get("/vault")
def vault(request: Request):
    return request.app.state.integrations.vault()

@router.get("/integrations")
def integrations(request: Request):
    return request.app.state.integrations.bundle()
