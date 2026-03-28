from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.portfolio import router as portfolio_router


app = FastAPI(
    title="Portsigma API",
    version="0.1.0",
    description="Portfolio analytics API with Yahoo Finance, FX conversion, and GARCH volatility.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio_router, prefix="/api/v1")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
