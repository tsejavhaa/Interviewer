/* ═══════════════════════════════════════════════════════════════
   RENDER QUESTION CARD
═══════════════════════════════════════════════════════════════ */
function renderQuestion(idx) {
  const q   = session.questions[idx];
  const num = idx + 1;
  const tot = session.questions.length;
  const isLast = idx + 1 >= tot;

  document.getElementById('question-area').innerHTML = `
    <div class="card" id="qcard-${idx}">

      <div class="q-meta">
        <span class="q-num">Q ${num} / ${tot} · ${escHtml(session.role)}</span>
        <span class="q-source-badge ${q.source === 'db' ? 'db' : 'llm'}" title="${q.source === 'db' ? 'From your database' : 'LLM generated'}">
          ${q.source === 'db' ? '🗄 DB' : '🤖 AI'}
        </span>
        <span class="q-badge speaking" id="qbadge-${idx}">Speaking…</span>
      </div>

      <div class="q-text" id="qtext-${idx}">${escHtml(q.question)}</div>

      <button class="play-btn" id="play-btn-${idx}" onclick="playQuestion(${idx})">
        <span id="play-icon-${idx}">▶</span>&nbsp;Play Question
      </button>

      <div class="card-label">Your Answer</div>

      <div class="recorder-row">
        <button class="record-btn" id="rec-btn-${idx}" onclick="toggleRecord(${idx})" disabled>🎤</button>
        <div class="recorder-info">
          <div class="rec-status" id="rec-status-${idx}">Waiting for question…</div>
          <canvas id="waveform"></canvas>
        </div>
      </div>

      <!-- Result (shown after answer) -->
      <div class="answer-result" id="result-${idx}">

        <div class="score-row">
          <div>
            <div class="big-score" id="pron-score-${idx}">—</div>
            <div class="score-details">
              <span class="grade-badge" id="pron-grade-${idx}"></span>
              <span class="feedback-text" id="pron-feedback-${idx}"></span>
            </div>
          </div>
          <div class="arc-wrap">
            <svg width="72" height="72" viewBox="0 0 72 72" overflow="visible">
              <circle cx="36" cy="36" r="28" fill="none" stroke="#1e222c" stroke-width="5"/>
              <circle id="arc-${idx}" cx="36" cy="36" r="28" fill="none"
                stroke="#1d4ed8" stroke-width="5" stroke-linecap="round"
                stroke-dasharray="175.9" stroke-dashoffset="175.9"
                transform="rotate(-90 36 36)"
                style="transition:stroke-dashoffset 1s cubic-bezier(.4,0,.2,1),stroke .5s"/>
            </svg>
          </div>
        </div>

        <div class="card-label" style="margin-top:4px">Word Breakdown</div>
        <div class="words-grid" id="word-chips-${idx}"></div>

        <div class="transcript-block" id="transcript-${idx}"></div>

        <!-- Content quality score (shown after answer) -->
        <div id="content-score-wrap-${idx}" style="display:none;margin:14px 0;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
          <div style="font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--accent);text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="width:5px;height:5px;border-radius:50%;background:var(--accent);display:inline-block"></span>Answer Quality
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
            <span id="content-score-num-${idx}" style="font-family:var(--mono);font-size:32px;font-weight:700;line-height:1">—</span>
            <span id="content-score-label-${idx}" style="font-family:var(--mono);font-size:13px;font-weight:700">—</span>
          </div>
          <div id="content-score-fb-${idx}" style="font-family:var(--mono);font-size:11px;color:var(--sub);line-height:1.7"></div>
        </div>

        <div class="card-label blue" style="margin-top:14px">AI Feedback</div>
        <div class="feedback-box" id="feedback-${idx}"><span style="color:var(--muted)">Generating…</span></div>

        <button class="next-btn" id="next-btn-${idx}" onclick="nextQuestion(${idx})">
          ${isLast ? 'Finish Interview ✓' : 'Next Question →'}
        </button>
      </div>

      <!-- Hint -->
      <div class="hint-section">
        <button class="hint-toggle-btn" id="hint-btn-${idx}" onclick="toggleHint(${idx})">
          💡 Show Model Answer (Hint)
        </button>
        <div class="hint-box" id="hint-box-${idx}">
          <div class="card-label blue" style="margin-bottom:8px">Model Answer</div>
          <div id="hint-text-${idx}" style="font-family:var(--mono);font-size:var(--hint-text-size,13px);color:var(--sub);line-height:1.8"></div>
        </div>
      </div>

    </div>`;

  setTimeout(() => playQuestion(idx), 500);
}

/* ═══════════════════════════════════════════════════════════════
   TTS PLAYBACK
═══════════════════════════════════════════════════════════════ */
async function playQuestion(idx) {
  const btn    = document.getElementById(`play-btn-${idx}`);
  const icon   = document.getElementById(`play-icon-${idx}`);
  const badge  = document.getElementById(`qbadge-${idx}`);
  const recBtn = document.getElementById(`rec-btn-${idx}`);

  if (questionAudio) { questionAudio.pause(); questionAudio = null; }

  if (questionPlaying) {
    questionPlaying = false;
    btn.classList.remove('active');
    icon.textContent = '▶';
    if (recBtn) recBtn.disabled = false;
    setRecStatus(idx, 'active', 'Ready — press mic to answer');
    zcSetListening();
      return;
  }

  btn.classList.add('active');
  icon.textContent   = '■';
  questionPlaying    = true;
  badge.className    = 'q-badge speaking';
  badge.textContent  = 'Speaking…';
  zcSetSpeaking(session.questions[idx].question);

  const onDone = () => {
    questionPlaying  = false;
    btn.classList.remove('active');
    icon.textContent = '▶';
    badge.className   = 'q-badge waiting';
    badge.textContent = 'Waiting…';
    if (recBtn) recBtn.disabled = false;
    setRecStatus(idx, 'active', 'Ready — press mic to answer');
    zcSetListening();
    };

  try {
    questionAudio = new Audio(`${API}/session/question/${idx}/audio?t=${Date.now()}`);
    questionAudio.crossOrigin = 'anonymous';
    questionAudio.onended = onDone;
    questionAudio.onerror = onDone;
    questionAudio.play()
      .then(()=>{ try{startLipSyncFromAudio(questionAudio);}catch(_){startSimLipSync();} })
      .catch(()=>{ startSimLipSync(); onDone(); });
  } catch { onDone(); }
}

/* ═══════════════════════════════════════════════════════════════
   RECORDING
═══════════════════════════════════════════════════════════════ */
async function toggleRecord(idx) {
  isRecording ? stopRecording(idx) : await startRecording(idx);
}

async function startRecording(idx) {
  if (questionAudio) { questionAudio.pause(); questionAudio = null; questionPlaying = false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setupWaveform(stream);
    mediaRecorder = new MediaRecorder(stream);
    audioChunks   = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => handleAnswerStop(idx);
    mediaRecorder.start();
    isRecording = true;
    const btn = document.getElementById(`rec-btn-${idx}`);
    btn.classList.add('recording');
    btn.textContent = '⏹';
    setRecStatus(idx, 'recording', '● Recording… click to stop');
    const pip = document.querySelector('.zc-pip'); if(pip) pip.classList.add('recording');
  } catch(err) {
    setRecStatus(idx, '', `Mic error: ${err.message}`);
  }
}

function stopRecording(idx) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  isRecording = false;
  cancelAnimationFrame(animFrame);
  const btn = document.getElementById(`rec-btn-${idx}`);
  if (btn) { btn.classList.remove('recording'); btn.textContent = '🎤'; }
  setRecStatus(idx, 'active', 'Processing…');
  const pip = document.querySelector('.zc-pip'); if(pip) pip.classList.remove('recording');
}

async function handleAnswerStop(idx) {
  const blob   = new Blob(audioChunks, { type: 'audio/webm' });
  const recBtn = document.getElementById(`rec-btn-${idx}`);
  if (recBtn) recBtn.disabled = true;

  const fd = new FormData();
  fd.append('audio', blob, 'answer.webm');
  setRecStatus(idx, 'active', 'Transcribing…');

  try {
    const res  = await fetch(`${API}/session/answer/${idx}`, { method:'POST', body:fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Submit failed');

    showAnswerResult(idx, data);
    session.questions[idx].answered            = true;
    session.questions[idx].answer_text         = data.transcript;
    session.questions[idx].pronunciation_score = data.pronunciation?.score || 0;
    updateProgress();
    addScoreItem(idx, data);
    streamFeedback(idx, data.session_done);  // rating called inside streamFeedback after done
  } catch(err) {
    setRecStatus(idx, 'recording', `⚠ ${err.message} — try again`);
    if (recBtn) { recBtn.disabled = false; recBtn.textContent = '🎤'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   SHOW RESULT
═══════════════════════════════════════════════════════════════ */
function showAnswerResult(idx, data) {
  const pron    = data.pronunciation;
  const content = data.content || {};
  const score = pron.score;
  const color = scoreColor(score);
  const gc    = gradeColors[pron.grade] || { bg:'#1e222c', fg:'#888' };

  document.getElementById(`pron-score-${idx}`).textContent  = score + '%';
  document.getElementById(`pron-score-${idx}`).style.color  = color;

  const gradeEl = document.getElementById(`pron-grade-${idx}`);
  gradeEl.textContent      = 'Grade ' + pron.grade;
  gradeEl.style.background = gc.bg;
  gradeEl.style.color      = gc.fg;

  document.getElementById(`pron-feedback-${idx}`).textContent = pron.feedback;

  // Arc
  const circ = 175.9;
  const arc  = document.getElementById(`arc-${idx}`);
  if (arc) {
    arc.style.strokeDashoffset = circ - (score / 100) * circ;
    arc.style.stroke = color;
  }

  // Word chips
  const chips = document.getElementById(`word-chips-${idx}`);
  const words = (pron.words || []).filter(w => w.status !== 'extra').slice(0, 14);
  chips.innerHTML = words.map(w => `
    <div class="word-chip ${w.status}">
      <div class="wc-target">${escHtml(w.word || w.spoken || '?')}</div>
      <div class="wc-spoken">${w.status==='correct'?'✓':w.status==='missing'?'◌':escHtml(w.spoken||'')}</div>
    </div>`).join('');

  document.getElementById(`transcript-${idx}`).innerHTML =
    `<strong>Heard:</strong> "${escHtml(data.transcript || '(nothing)')}"`;

  // ── Content quality score ──────────────────────────────────────────────────
  if (content && typeof content.score !== 'undefined') {
    const csEl = document.getElementById('content-score-wrap-' + idx);
    if (csEl) {
      const s     = content.score;
      const color = s >= 8 ? '#00e5a0' : s >= 6 ? '#00b8ff' : s >= 4 ? '#ffaa00' : s >= 2 ? '#ff8c00' : '#ff6b6b';
      csEl.style.display = 'block';
      document.getElementById('content-score-num-'  + idx).textContent = s + '/10';
      document.getElementById('content-score-num-'  + idx).style.color = color;
      document.getElementById('content-score-label-'+ idx).textContent = content.label || '';
      document.getElementById('content-score-label-'+ idx).style.color = color;
      document.getElementById('content-score-fb-'   + idx).textContent = content.feedback || '';
    }
  } 

  // Show content score block with animated evaluating state
  const csWrap = document.getElementById('content-score-wrap-' + idx);
  if (csWrap) {
    csWrap.style.display = 'block';
    const numEl = document.getElementById('content-score-num-' + idx);
    const lblEl = document.getElementById('content-score-label-' + idx);
    const fbEl  = document.getElementById('content-score-fb-' + idx);
    if (numEl) { numEl.textContent = ''; numEl.style.color = 'var(--muted)'; }
    if (lblEl) { lblEl.textContent = '⏳ Evaluating your answer…'; lblEl.style.color = 'var(--sub)'; lblEl.style.fontSize = '11px'; }
    if (fbEl)  { fbEl.textContent  = 'AI is rating your response based on the model answer. This may take 15–30 seconds on slower hardware.'; fbEl.style.color = 'var(--muted)'; }
    // Animate dots while waiting
    let dots = 0;
    window['_ratingTimer_' + idx] = setInterval(() => {
      if (!document.getElementById('content-score-wrap-' + idx)) return;
      const el = document.getElementById('content-score-label-' + idx);
      if (el && el.textContent.startsWith('⏳')) {
        dots = (dots + 1) % 4;
        el.textContent = '⏳ Evaluating' + '.'.repeat(dots);
      }
    }, 600);
  }

  document.getElementById(`result-${idx}`).classList.add('visible');
  setRecStatus(idx, 'done', '✓ Answer recorded');
  zcSetDone();
  document.getElementById(`qbadge-${idx}`).className  = 'q-badge done';
  document.getElementById(`qbadge-${idx}`).textContent = 'Done';

  // Animate score counter
  let cur = 0;
  const el = document.getElementById(`pron-score-${idx}`);
  const tick = setInterval(() => {
    cur = Math.min(cur + Math.max(1, Math.round(score / 25)), score);
    el.textContent = cur + '%';
    if (cur >= score) clearInterval(tick);
  }, 28);
}


/* ═══════════════════════════════════════════════════════════════
   ANSWER QUALITY RATING  (called after feedback stream done)
═══════════════════════════════════════════════════════════════ */
async function rateAnswer(idx) {
  const numEl  = document.getElementById('content-score-num-'   + idx);
  const lblEl  = document.getElementById('content-score-label-' + idx);
  const fbEl   = document.getElementById('content-score-fb-'    + idx);
  const csWrap = document.getElementById('content-score-wrap-'  + idx);
  if (csWrap) csWrap.style.display = 'block';

  try {
    const res  = await fetch(`${API}/session/rate/${idx}`, { method: 'POST' });
    const data = await res.json();

    // Clear evaluating timer
    if (window['_ratingTimer_' + idx]) {
      clearInterval(window['_ratingTimer_' + idx]);
      delete window['_ratingTimer_' + idx];
    }

    const s     = data.score ?? 0;
    const color = contentScoreColor(s);

    if (numEl) { numEl.textContent = s + '/10'; numEl.style.color = color; numEl.style.fontSize = '32px'; }
    if (lblEl) { lblEl.textContent = data.label || ''; lblEl.style.color = color; lblEl.style.fontSize = '13px'; }
    if (fbEl)  { fbEl.textContent  = data.feedback || ''; fbEl.style.color = 'var(--sub)'; }

    // Update sidebar
    const sideNumEl = document.getElementById('side-cscore-' + idx);
    const sideLblEl = document.getElementById('side-clabel-' + idx);
    const sideBarEl = document.getElementById('side-cbar-'   + idx);
    if (sideNumEl) { sideNumEl.textContent = s + '/10'; sideNumEl.style.color = color; }
    if (sideLblEl) { sideLblEl.textContent = data.label || ''; sideLblEl.style.color = color; }
    if (sideBarEl) { sideBarEl.style.width = (s * 10) + '%'; sideBarEl.style.background = color; }

  } catch(e) {
    if (window['_ratingTimer_' + idx]) { clearInterval(window['_ratingTimer_' + idx]); }
    if (lblEl) { lblEl.textContent = 'Could not rate'; lblEl.style.color = 'var(--muted)'; }
    if (fbEl)  fbEl.textContent = 'Rating failed: ' + e.message;
  }
}

/* ═══════════════════════════════════════════════════════════════
   STREAM LLM FEEDBACK
═══════════════════════════════════════════════════════════════ */
async function streamFeedback(idx, sessionDone) {
  const fbEl = document.getElementById(`feedback-${idx}`);
  const next = document.getElementById(`next-btn-${idx}`);
  fbEl.innerHTML = '<span class="blink-cursor"></span>';
  let full = '';
  try {
    const es = new EventSource(`${API}/session/feedback/${idx}`);
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.token) { full += d.token; fbEl.textContent = full; fbEl.innerHTML += '<span class="blink-cursor"></span>'; }
      if (d.done) {
        es.close();
        fbEl.textContent = d.full || full;
        if (next) next.style.display = 'block';
        // Call rate endpoint now that Ollama is free
        rateAnswer(idx);
        const allAnswered = session && session.questions.every(q => q.answered);
        if (sessionDone && allAnswered) setTimeout(() => showSummary(), 600);
      }
    };
    es.onerror = () => {
      es.close();
      if (!full) fbEl.textContent = 'Feedback unavailable — is Ollama running?';
      if (next) next.style.display = 'block';
      rateAnswer(idx);
      const allAnswered = session && session.questions.every(q => q.answered);
      if (sessionDone && allAnswered) setTimeout(() => showSummary(), 300);
    };
  } catch {
    fbEl.textContent = 'Feedback error.';
    if (next) next.style.display = 'block';
  }
}

/* ═══════════════════════════════════════════════════════════════
   HINT
═══════════════════════════════════════════════════════════════ */
function toggleHint(idx) {
  const box = document.getElementById(`hint-box-${idx}`);
  const btn = document.getElementById(`hint-btn-${idx}`);
  const open = box.classList.toggle('visible');
  if (open) {
    btn.classList.add('active');
    btn.textContent = '💡 Hide Model Answer';
    if (!_hintLoaded[idx]) streamHint(idx);
  } else {
    btn.classList.remove('active');
    btn.textContent = '💡 Show Model Answer (Hint)';
  }
}

async function streamHint(idx) {
  const textEl = document.getElementById(`hint-text-${idx}`);
  const btn    = document.getElementById(`hint-btn-${idx}`);
  btn.disabled = true;
  textEl.innerHTML = '<span style="color:var(--muted)">Generating<span class="blink-cursor"></span></span>';
  let full = '';
  try {
    const es = new EventSource(`${API}/session/hint/${idx}`);
    es.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.token) { full += d.token; textEl.textContent = full; }
      if (d.done) { es.close(); textEl.textContent = d.full || full; _hintLoaded[idx] = true; btn.disabled = false; }
    };
    es.onerror = () => { es.close(); if (!full) textEl.textContent = 'Hint unavailable.'; btn.disabled = false; };
  } catch { textEl.textContent = 'Hint error.'; btn.disabled = false; }
}

/* ═══════════════════════════════════════════════════════════════
   NEXT QUESTION
═══════════════════════════════════════════════════════════════ */
function nextQuestion(idx) {
  const next = idx + 1;
  if (next >= session.questions.length) {
    const allAnswered = session.questions.every(q => q.answered);
    if (allAnswered) showSummary();
    return;
  }
  currentIndex = next;
  renderQuestion(next);
  document.getElementById('question-area').scrollIntoView({ behavior:'smooth' });
}

/* ═══════════════════════════════════════════════════════════════
   SCORE PANEL
═══════════════════════════════════════════════════════════════ */
function addScoreItem(idx, data) {
  const list  = document.getElementById('score-list');
  const pron  = data.pronunciation;
  const score = pron.score;
  const color = scoreColor(score);
  const q     = session.questions[idx];
  const empty = list.querySelector('.score-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'score-item';
  const cScore   = data.content ? data.content.score   : -1;
  const cLabel   = data.content ? data.content.label   : '';
  const cFb      = data.content ? data.content.feedback : '';
  const cColor   = cScore >= 8 ? '#00e5a0' : cScore >= 6 ? '#00b8ff' : cScore >= 4 ? '#ffaa00' : cScore >= 2 ? '#ff8c00' : '#ff6b6b';

  item.innerHTML = `
    <div class="score-item-top">
      <span class="score-item-q">Q${idx+1}: ${escHtml(q.question.slice(0,32))}…</span>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        ${cScore >= 0 ? `<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:${cColor}">${cScore}/10</span>` : ''}
        <span class="score-item-val" style="color:${color}">${score}%</span>
      </div>
    </div>
    <div style="font-family:var(--mono);font-size:9px;font-weight:700;margin-bottom:2px">
      Answer: <span id="side-cscore-${idx}" style="color:${cColor}">${cScore >= 0 ? cScore + '/10' : '…'}</span>
      <span id="side-clabel-${idx}" style="color:${cColor}">${cScore >= 0 ? cLabel : ''}</span>
    </div>
    <div class="score-track" style="margin-bottom:4px">
      <div class="score-bar-fill" id="side-cbar-${idx}" style="width:${cScore >= 0 ? cScore*10 : 0}%;background:${cColor};transition:width .6s ease"></div>
    </div>
    <div class="score-track"><div class="score-bar-fill" style="width:0%;background:${color}" id="sbar-${idx}"></div></div>
    <div class="score-item-fb">${escHtml(pron.feedback)}</div>`;
  list.appendChild(item);
  setTimeout(() => { document.getElementById(`sbar-${idx}`).style.width = score + '%'; }, 60);

  const scores = session.questions.filter(q => q.answered).map(q => q.pronunciation_score || 0);
  const avg = scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : 0;
  document.getElementById('avg-val').textContent  = avg + '%';
  document.getElementById('avg-val').style.color  = scoreColor(avg);
  document.getElementById('avg-box').classList.add('visible');
}

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
═══════════════════════════════════════════════════════════════ */
async function showSummary() {
  document.getElementById('summary-overlay').classList.add('visible');
  const answered = session.questions.filter(q => q.answered);
  const avg = answered.length
    ? Math.round(answered.map(q => q.pronunciation_score||0).reduce((a,b)=>a+b,0)/answered.length)
    : 0;
  document.getElementById('sum-role').textContent  = `${session.role} · ${session.difficulty}`;
  document.getElementById('sum-avg').textContent   = avg + '%';
  document.getElementById('sum-avg').style.color   = scoreColor(avg);
  document.getElementById('sum-count').textContent = `${answered.length}/${session.questions.length}`;
  try {
    const res  = await fetch(`${API}/session/summary`);
    const data = await res.json();
    document.getElementById('sum-text').textContent = data.summary || 'No summary available.';
  } catch {
    document.getElementById('sum-text').textContent = 'Summary unavailable — is Ollama running?';
  }
}
function showSummaryFromSession() {
  document.getElementById('summary-overlay').classList.add('visible');
  document.getElementById('sum-role').textContent = `${session.role} · ${session.difficulty}`;
  document.getElementById('sum-text').textContent = session.summary || 'Generating…';
  if (!session.summary) showSummary();
}
function closeSummary() { document.getElementById('summary-overlay').classList.remove('visible'); }
async function resetInterview() {
  // Block health check from restoring the completed session
  window._sessionCancelled = true;
  session = null; currentIndex = 0;

  document.getElementById('sidebar').classList.remove('inactive');
  const startBtn = document.getElementById('start-btn');
  if (startBtn) { startBtn.style.display = ''; startBtn.disabled = false; startBtn.textContent = 'Begin Interview'; }
  const cb = document.getElementById('cancel-btn');
  if (cb) cb.classList.remove('visible');
  await fetch(`${API}/session`, { method:'DELETE' }).catch(()=>{});
  // NOTE: _sessionCancelled is intentionally NOT cleared here.
  // It is only cleared in startInterview() when a new session begins.
  document.getElementById('summary-overlay').classList.remove('visible');
  document.getElementById('idle-screen').classList.remove('hidden');
  document.getElementById('progress-wrap').classList.remove('visible');
  document.getElementById('question-area').innerHTML = '';
  document.getElementById('score-list').innerHTML = '<div class="score-empty">Scores appear here<br>as you answer.</div>';
  document.getElementById('avg-box').classList.remove('visible');
  document.getElementById('footer-session').textContent = '';
  zcHide();
}

/* ═══════════════════════════════════════════════════════════════
   WAVEFORM
═══════════════════════════════════════════════════════════════ */
function setupWaveform(stream) {
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  drawWaveform();
}
function drawWaveform() {
  const canvas = document.getElementById('waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  function draw() {
    animFrame = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth   = 1.5;
    buf.forEach((v, i) => {
      const y = (v / 255) * H;
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * (W / buf.length), y);
    });
    ctx.stroke();
  }
  draw();
}