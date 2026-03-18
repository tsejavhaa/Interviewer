/* ═══════════════════════════════════════════════════════════════
   START INTERVIEW
═══════════════════════════════════════════════════════════════ */
async function startInterview() {
  const role = document.getElementById('role-input').value.trim();
  if (!role) { alert('Please enter a job role.'); return; }

  const count = parseInt(document.getElementById('q-count').value);
  const focus = document.getElementById('focus-input').value.trim();
  const lang  = document.getElementById('lang-select').value;
  const speed = document.querySelector('.speed-chip.active')?.textContent.trim().replace('×','') || '1.0';
  const voice = document.getElementById('voice-select').value;

  // Show preparing state — hide start, keep cancel hidden
  const startBtn  = document.getElementById('start-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  startBtn.disabled    = true;
  startBtn.innerHTML   = '<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(10,12,16,.3);border-top-color:var(--bg);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px"></span>Preparing…';
  cancelBtn.classList.remove('visible');
  document.getElementById('sidebar').classList.add('inactive');
  document.getElementById('idle-screen').classList.add('hidden');
  document.getElementById('gen-loader').classList.add('visible');
  document.getElementById('question-area').innerHTML = '';

  const steps = ['Generating questions…','Generating model answers…','Warming up voice…','Ready'];
  let step = 0;
  const stepTimer = setInterval(() => {
    const sub = document.getElementById('gen-loader-sub');
    if (sub && step < steps.length) sub.textContent = steps[step++];
  }, 2200);

  const fd = new FormData();
  fd.append('role', role);
  fd.append('difficulty', difficulty);
  fd.append('focus_areas', focus);
  fd.append('num_questions', count);
  fd.append('tts_voice', voice);
  fd.append('tts_speed', speed);
  fd.append('language', lang);

  try {
    const res = await fetch(`${API}/session/create`, { method:'POST', body:fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
    session = await res.json();
  } catch(err) {
    clearInterval(stepTimer);
    document.getElementById('gen-loader').classList.remove('visible');
    document.getElementById('idle-screen').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('inactive');
    startBtn.disabled    = false;
    startBtn.textContent = 'Begin Interview';
    alert(`Error: ${err.message}`);
    return;
  }

  clearInterval(stepTimer);
  currentIndex = 0;
  // Clear cancel guard — new interview is live
  window._sessionCancelled = false;

  document.getElementById('gen-loader').classList.remove('visible');
  document.getElementById('progress-wrap').classList.add('visible');
  document.getElementById('score-list').innerHTML = '<div class="score-empty">Scores appear here<br>as you answer.</div>';
  document.getElementById('avg-box').classList.remove('visible');
  document.getElementById('footer-session').textContent = `${role} · ${difficulty}`;

  // Show Cancel, hide Begin
  startBtn.disabled    = false;
  startBtn.textContent = 'Begin Interview';
  startBtn.style.display = 'none';
  cancelBtn.classList.add('visible');

  updateProgress();
  zcShowCard(role);
  renderQuestion(0);
}

/* ═══════════════════════════════════════════════════════════════
   CANCEL INTERVIEW
═══════════════════════════════════════════════════════════════ */
function cancelInterview() {
  if (!confirm('Cancel the current interview and start over?')) return;

  // Immediately block health check from restoring this session
  window._sessionCancelled = true;
  session = null;

  // Stop audio
  if (questionAudio) { questionAudio.pause(); questionAudio.src = ''; questionAudio = null; }
  questionPlaying = false;

  // Stop recording — null onstop prevents handleAnswerStop from firing
  if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  isRecording = false;

  // Stop waveform + lip sync
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  stopLipSync();

  resetInterview();
}

/* ═══════════════════════════════════════════════════════════════
   RESTORE SESSION  (on page refresh)
═══════════════════════════════════════════════════════════════ */
function restoreSession() {
  currentIndex = session.current_index || 0;
  window._sessionCancelled = false;

  document.getElementById('idle-screen').classList.add('hidden');
  document.getElementById('progress-wrap').classList.add('visible');
  document.getElementById('sidebar').classList.add('inactive');
  // Show Cancel, hide Begin
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('cancel-btn').classList.add('visible');

  updateProgress();
  zcShowCard(session.role || 'Interviewer');
  session.state === 'completed' ? showSummaryFromSession() : renderQuestion(currentIndex);
}

/* ═══════════════════════════════════════════════════════════════
   PROGRESS
═══════════════════════════════════════════════════════════════ */
function updateProgress() {
  if (!session) return;
  const total    = session.questions.length;
  const answered = session.questions.filter(q => q.answered).length;
  const pct      = total > 0 ? Math.round(answered / total * 100) : 0;
  document.getElementById('progress-label').textContent = `Question ${answered} / ${total}`;
  document.getElementById('progress-pct').textContent   = pct + '%';
  document.getElementById('progress-fill').style.width  = pct + '%';
}