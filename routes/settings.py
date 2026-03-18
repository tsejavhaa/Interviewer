from fastapi import APIRouter, Form
import tts_module

router = APIRouter(prefix="/settings")

@router.post("/voice")
async def set_voice(voice: str = Form(...)):
    tts_module.set_voice(voice)
    return {"voice": tts_module.get_voice()}

@router.post("/speed")
async def set_speed(speed: str = Form(...)):
    tts_module.set_speed(speed)
    return {"speed": tts_module.get_speed()}