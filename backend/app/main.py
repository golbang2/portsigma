import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers.portfolio import router as portfolio_router

limiter = Limiter(key_func=get_remote_address)


def parse_allowed_origins() -> list[str]:
    raw_origins = os.getenv("FRONTEND_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
    return list(dict.fromkeys(defaults + origins))


app = FastAPI(
    title="Portsigma API",
    version="0.1.0",
    description="Portfolio analytics API with Yahoo Finance, FX conversion, and GARCH volatility.",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$|https://portsigma[^.]*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 1_000_000:
        return JSONResponse(status_code=413, content={"detail": "요청이 너무 큽니다. (최대 1MB)"})
    return await call_next(request)


app.include_router(portfolio_router, prefix="/api/v1")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
