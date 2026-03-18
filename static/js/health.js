/* ═══════════════════════════════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════════════════════════════ */
async function checkHealth() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    serverOk = true;
    ollamaOk = d.ollama;

    if (ollamaOk && d.tts) {
      dot.className    = 'status-dot ok';
      text.textContent = `${d.ollama_model} · ${d.tts_voice}`;
    } else if (!ollamaOk) {
      dot.className    = 'status-dot warn';
      text.textContent = 'Ollama offline — run: ollama serve';
    } else {
      dot.className    = 'status-dot warn';
      text.textContent = 'TTS unavailable';
    }

    if (d.tts_speed) {
      document.querySelectorAll('.speed-chip').forEach(b =>
        b.classList.toggle('active', b.textContent.trim().startsWith(d.tts_speed))
      );
    }
    // Sync voice+avatar only on very first health check (page load)
    if (d.tts_voice && !window._voiceInitDone) {
      window._voiceInitDone = true;
      const sel = document.getElementById('voice-select');
      if (sel) sel.value = d.tts_voice;
      avatarFromVoice(d.tts_voice);
    }

    document.getElementById('start-btn').disabled = !ollamaOk;

    // Show voice download status
    if (!d.voices_ready) {
      const existing = document.getElementById('voices-dl-msg');
      if (!existing) {
        const msg = document.createElement('div');
        msg.id = 'voices-dl-msg';
        msg.style.cssText = 'font-family:var(--mono);font-size:9px;color:var(--miss);text-align:center;padding:4px 0';
        msg.textContent = '⏳ Downloading voices… (first run only)';
        document.getElementById('start-btn').insertAdjacentElement('beforebegin', msg);
      }
    } else {
      const msg = document.getElementById('voices-dl-msg');
      if (msg) msg.remove();
    }

    if (!session && !window._sessionCancelled && d.session && d.session.state !== 'setup') {
      session = d.session;
      restoreSession();
    }
  } catch {
    serverOk = false;
    dot.className    = 'status-dot error';
    text.textContent = 'Server offline — uvicorn server:app --port 8766';
    document.getElementById('start-btn').disabled = true;
  }
}
checkHealth();
setInterval(checkHealth, 8000);
setAvatar('male1', document.querySelector('.avatar-chip[data-avatar="male1"]'));
avatarFromVoice('am_adam');