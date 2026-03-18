"""
Interviewer — FastAPI entry point.
Run: uvicorn server:app --host 127.0.0.1 --port 8766 --reload
"""
from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import tts_module, stt_module
from routes import health, settings, session, database


@asynccontextmanager
async def lifespan(app: FastAPI):
    stt_module.load_model()
    asyncio.create_task(asyncio.to_thread(tts_module.preload))
    yield


app = FastAPI(title="AI Interviewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (CSS, JS)
app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")

# Routers
app.include_router(health.router)
app.include_router(settings.router)
app.include_router(session.router)
app.include_router(database.router)


@app.get("/")
def index():
    return FileResponse(Path(__file__).parent / "index.html")