/* ═══════════════════════════════════════════════════════════════
   AVATAR — Real-time audio-driven lip sync
═══════════════════════════════════════════════════════════════ */
let lipSyncCtx = null, lipSyncAnalyser = null, lipSyncFrame = null;
let zcTimerInterval = null, zcSeconds = 0;
let _simFrame = null;

function zcShowCard(role) {
  const card = document.getElementById('zoom-card');
  card.classList.add('visible','session-active');
  card.classList.remove('speaking','listening','done','idle-waiting');
  const ov = document.getElementById('zc-idle-overlay');
  if (ov) ov.classList.remove('visible');
  const rt = document.getElementById('zc-role-tag');
  if (rt) rt.textContent = role + ' · Interviewer';
  zcSeconds = 0; clearInterval(zcTimerInterval);
  zcTimerInterval = setInterval(() => {
    zcSeconds++;
    const el = document.getElementById('zc-timer');
    if (el) el.textContent = String(Math.floor(zcSeconds/60)).padStart(2,'0') + ':' + String(zcSeconds%60).padStart(2,'0');
  }, 1000);
}
function zcSetSpeaking(txt) {
  const card = document.getElementById('zoom-card');
  card.classList.add('speaking'); card.classList.remove('listening','done');
  const p = document.getElementById('zc-qtext'); if (p) p.textContent = txt||'';
}
function zcSetListening() {
  const card = document.getElementById('zoom-card');
  card.classList.remove('speaking','done'); card.classList.add('listening');
  stopLipSync(); cancelAnimationFrame(_simFrame); setMouthOpen(0);
}
function zcSetDone() {
  const card = document.getElementById('zoom-card');
  card.classList.remove('speaking','listening'); card.classList.add('done');
  stopLipSync(); cancelAnimationFrame(_simFrame); setMouthOpen(0);
}
function zcHide() {
  document.getElementById('zoom-card').classList.remove('visible','speaking','listening','done','session-active','idle-waiting');
  const ov = document.getElementById('zc-idle-overlay');
  if (ov) ov.classList.add('visible');
  clearInterval(zcTimerInterval); stopLipSync(); cancelAnimationFrame(_simFrame); setMouthOpen(0);
}
function startLipSyncFromAudio(audioEl) {
  stopLipSync();
  try {
    lipSyncCtx = new (window.AudioContext||window.webkitAudioContext)();
    lipSyncAnalyser = lipSyncCtx.createAnalyser();
    lipSyncAnalyser.fftSize=256; lipSyncAnalyser.smoothingTimeConstant=0.55;
    const src = lipSyncCtx.createMediaElementSource(audioEl);
    src.connect(lipSyncAnalyser); lipSyncAnalyser.connect(lipSyncCtx.destination);
    const data=new Uint8Array(lipSyncAnalyser.frequencyBinCount);
    let prev=0;
    (function tick(){ lipSyncFrame=requestAnimationFrame(tick);
      lipSyncAnalyser.getByteFrequencyData(data);
      let sum=0; for(let i=4;i<48;i++) sum+=data[i];
      const t=Math.min(1,(sum/44)/72); prev=prev*0.62+t*0.38; setMouthOpen(prev);
    })();
  } catch(e){ startSimLipSync(); }
}
function stopLipSync() {
  cancelAnimationFrame(lipSyncFrame); lipSyncFrame=null;
  if(lipSyncCtx){ try{lipSyncCtx.close();}catch(_){} lipSyncCtx=null; lipSyncAnalyser=null; }
}
function startSimLipSync() {
  cancelAnimationFrame(_simFrame); let ph=0;
  (function tick(){ _simFrame=requestAnimationFrame(tick); ph+=0.12;
    const v=(Math.sin(ph*2.3)*0.4+Math.sin(ph*4.7)*0.3+Math.sin(ph*1.1)*0.3)*0.5+0.5;
    setMouthOpen(v*0.85);
  })();
}



/* ═══════════════════════════════════════════════════════════════
   SVG AVATAR SWITCHER
   4 characters: male1 (Alex), female1 (Sarah), male2 (James), female2 (Emma)
   Auto-switches based on voice gender prefix: af_/bf_ → female, am_/bm_ → male
═══════════════════════════════════════════════════════════════ */

const AVATAR_META = {
  male1:   { name: 'Alex Chen',    title: 'Senior Engineer',   icon: '🎓', figId: 'zc-figure',         mouthOpen: 'zc-mouth-open',    teeth: 'zc-teeth',    closed: 'zc-mouth-closed',    ulip: 'zc-lip-upper'    },
  female1: { name: 'Sarah Park',   title: 'Tech Lead',         icon: '🎓', figId: 'zc-figure-female1', mouthOpen: 'zc-mouth-open-f1', teeth: 'zc-teeth-f1', closed: 'zc-mouth-closed-f1', ulip: 'zc-lip-upper-f1' },
  male2:   { name: 'James Miller', title: 'Principal Engineer', icon: '🎓', figId: 'zc-figure-male2',  mouthOpen: 'zc-mouth-open-m2', teeth: 'zc-teeth-m2', closed: 'zc-mouth-closed-m2', ulip: 'zc-lip-upper-m2' },
  female2: { name: 'Emma Wilson',  title: 'Staff Engineer',    icon: '🎓', figId: 'zc-figure-female2', mouthOpen: 'zc-mouth-open-f2', teeth: 'zc-teeth-f2', closed: 'zc-mouth-closed-f2', ulip: 'zc-lip-upper-f2' },
};

let currentAvatar = 'male1';


// Avatar → representative voice (used when user picks avatar manually)
const AVATAR_VOICE_MAP = {
  male1:   'am_adam',
  female1: 'af_heart',
  male2:   'bm_george',
  female2: 'bf_emma',
};

function setAvatar(avatarKey, btn, fromVoiceChange = false) {
  currentAvatar = avatarKey;

  // Update chip active state
  document.querySelectorAll('.avatar-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const meta = AVATAR_META[avatarKey];

  // Show correct SVG, hide others
  Object.values(AVATAR_META).forEach(m => {
    const el = document.getElementById(m.figId);
    if (el) el.style.display = m.figId === meta.figId ? '' : 'none';
  });

  // Update name badge
  const nameEl = document.getElementById('zc-name');
  if (nameEl) nameEl.textContent = meta.name;
  const roleEl = document.getElementById('zc-role-tag');
  if (roleEl) roleEl.textContent = meta.title + ' · Interviewer';
  const idleName = document.getElementById('zc-idle-name');
  if (idleName) idleName.textContent = meta.name;

  // Sync voice to match avatar (only when user clicked avatar chip, not the other way around)
  if (!fromVoiceChange) {
    const mappedVoice = AVATAR_VOICE_MAP[avatarKey];
    if (mappedVoice) {
      const sel = document.getElementById('voice-select');
      if (sel && sel.value !== mappedVoice) {
        sel.value = mappedVoice;
        changeVoice(mappedVoice);
      }
    }
  }
}

// Voice → avatar mapping
const VOICE_AVATAR_MAP = {
  // American Female → Sarah
  'af_heart':   'female1', 'af_bella':  'female1',
  'af_sarah':   'female1', 'af_nicole': 'female1', 'af_sky': 'female1',
  // American Male → Alex
  'am_adam':    'male1',   'am_michael':'male1',
  'am_echo':    'male1',   'am_eric':   'male1',
  'am_liam':    'male1',   'am_onyx':   'male1',
  // British Female → Emma
  'bf_emma':    'female2', 'bf_isabella':'female2',
  // British Male → James
  'bm_george':  'male2',   'bm_lewis':  'male2',   'bm_daniel':'male2',
};

function avatarFromVoice(voiceId) {
  const target = VOICE_AVATAR_MAP[voiceId];
  if (!target || target === currentAvatar) return;
  const chip = document.querySelector(`.avatar-chip[data-avatar="${target}"]`);
  setAvatar(target, chip, true);  // fromVoiceChange=true → don't sync voice back
}

// Patch setMouthOpen to drive the active avatar's mouth elements
const _origSetMouthOpen = setMouthOpen;

function setMouthOpen(v) {
  const meta = AVATAR_META[currentAvatar];
  if (!meta) return;
  const jaw    = document.getElementById(meta.mouthOpen);
  const teeth  = document.getElementById(meta.teeth);
  const closed = document.getElementById(meta.closed);
  const ulip   = document.getElementById(meta.ulip);
  if (!jaw) return;
  const c = Math.max(0, Math.min(1, v));
  jaw.style.transform = `scaleY(${c < 0.04 ? 0.02 : c})`;
  jaw.style.opacity   = c < 0.04 ? 0 : 1;
  if (teeth)  teeth.style.opacity  = c > 0.15 ? Math.min(1, (c - 0.15) / 0.3) : 0;
  if (closed) closed.style.opacity = c > 0.1  ? Math.max(0, 1 - c * 4) : 1;
  if (ulip)   ulip.style.opacity   = c > 0.1  ? Math.max(0, 1 - c * 3) : 1;
}