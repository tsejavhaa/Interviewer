/* ═══════════════════════════════════════════════════════════════
   SETUP
═══════════════════════════════════════════════════════════════ */
function setDifficulty(d, btn) {
  difficulty = d;
  document.querySelectorAll('.diff-tabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setRole(role, btn) {
  document.querySelectorAll('#role-presets .role-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('role-input').value = role;
}

function clearRolePreset() {
  document.querySelectorAll('#role-presets .role-chip').forEach(b => b.classList.remove('active'));
}

document.getElementById('q-count').addEventListener('input', function() {
  document.getElementById('q-count-label').textContent   = this.value;
  document.getElementById('q-count-display').textContent = this.value;
});

function applySize(cls, varName, px, labelId) {
  document.documentElement.style.setProperty(varName, px + 'px');
  document.getElementById(labelId).textContent = px + 'px';
}

async function changeVoice(v) {
  const fd = new FormData(); fd.append('voice', v);
  await fetch(`${API}/settings/voice`, { method:'POST', body:fd });
  avatarFromVoice(v);
}

async function changeSpeed(s, btn) {
  document.querySelectorAll('.speed-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const fd = new FormData(); fd.append('speed', s);
  await fetch(`${API}/settings/speed`, { method:'POST', body:fd });
}