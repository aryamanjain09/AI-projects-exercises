import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, metrics, reports
from app.core.database import AsyncSessionLocal, engine
from app.models import CanonicalMetric, MetricResult, Report, User  # ensure models are registered
from app.services.normalizer import seed_canonical_metrics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Blood Report Tracker API",
        description="Upload and analyze blood lab reports with AI-powered metric extraction.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS (dev mode: allow all origins) ───────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth.router)
    app.include_router(reports.router)
    app.include_router(metrics.router)

    # ── Startup / Shutdown ────────────────────────────────────────────────────
    @app.on_event("startup")
    async def on_startup():
        logger.info("Application startup: seeding canonical metrics...")
        async with AsyncSessionLocal() as db:
            try:
                await seed_canonical_metrics(db)
                await db.commit()
                logger.info("Startup complete.")
            except Exception as exc:
                logger.error("Failed to seed canonical metrics: %s", exc)

    @app.on_event("shutdown")
    async def on_shutdown():
        await engine.dispose()
        logger.info("Database engine disposed.")

    # ── Health Check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
