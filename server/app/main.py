"""FastAPI application entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import forecasts as forecasts_router
from app.api import health as health_router
from app.api import market as market_router
from app.api import model as model_router
from app.api import news as news_router
from app.config import announce_startup_configuration, get_settings


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    settings = get_settings()
    announce_startup_configuration(settings)

    app = FastAPI(
        title="SPY Forecast Lab API",
        version="0.1.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,
    )

    v1_prefix = "/api/v1"
    app.include_router(health_router.router, prefix=v1_prefix)
    app.include_router(market_router.router, prefix=v1_prefix)
    app.include_router(forecasts_router.router, prefix=v1_prefix)
    app.include_router(model_router.router, prefix=v1_prefix)
    app.include_router(news_router.router, prefix=v1_prefix)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):  # noqa: ARG001
        logging.getLogger("app.main").exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={
                "message": "The server encountered an unexpected error.",
                "type": exc.__class__.__name__,
            },
        )

    return app


app = create_app()
