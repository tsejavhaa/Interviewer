from fastapi import APIRouter
import llm_module, tts_module, stt_module, session_module

router = APIRouter()

@router.get("/health")
def health():
    session = session_module.get_session()
    return {
        "status":       "ok",
        "ollama":       llm_module.is_available(),
        "ollama_model": llm_module.get_model(),
        "tts":          tts_module.is_available(),
        "tts_voice":    tts_module.get_voice(),
        "tts_speed":    tts_module.get_speed(),
        "tts_voices":   tts_module.get_voices(),
        "tts_speeds":   tts_module.get_speed_presets(),
        "stt_model":    stt_module._MODEL_NAME,
        "voices_ready": tts_module.voices_ready(),
        "session":      session.to_dict() if session else None,
    }