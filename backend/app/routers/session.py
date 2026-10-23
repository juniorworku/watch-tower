import asyncio
from urllib.parse import urlencode
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from .. import auth

router = APIRouter(prefix="/api", tags=["session"])

@router.get("/session")
def session(request: Request):
    settings = request.app.state.settings
    return {"configured": auth.configured(settings), "authenticated": auth.valid_session(settings, request.cookies.get(auth.COOKIE, ""))}

@router.post("/login")
async def login(request: Request):
    form = await request.form()
    destination = auth.safe_next(form.get("next", "/"))
    settings = request.app.state.settings
    if not auth.check_password(settings, str(form.get("password", ""))):
        await asyncio.sleep(0.6)
        return RedirectResponse("/login?" + urlencode({"error": "1", "next": destination}), status_code=303)
    response = RedirectResponse(destination, status_code=303)
    response.set_cookie(auth.COOKIE, auth.session_token(settings), max_age=auth.MAX_AGE, httponly=True, secure=settings.cookie_secure or settings.public_url.startswith("https://"), samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response

@router.post("/logout")
def logout():
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(auth.COOKIE, path="/")
    return response
