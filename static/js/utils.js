/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
function setRecStatus(idx, cls, msg) {
  const el = document.getElementById(`rec-status-${idx}`);
  if (el) { el.className = `rec-status ${cls}`; el.textContent = msg; }
}
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function scoreColor(s) {
  if (s >= 90) return '#1d4ed8';
  if (s >= 75) return '#3730a3';
  if (s >= 55) return '#ffaa00';
  if (s >= 40) return '#ff8c00';
  return '#ff6b6b';
}
const gradeColors = {
  A: { bg:'rgba(29,78,216,.12)',   fg:'#1d4ed8' },
  B: { bg:'rgba(0,184,255,.1)',   fg:'#3730a3' },
  C: { bg:'rgba(255,170,0,.1)',   fg:'#ffaa00' },
  D: { bg:'rgba(255,140,0,.1)',   fg:'#ff8c00' },
  F: { bg:'rgba(255,107,107,.1)', fg:'#ff6b6b' },
};

function contentScoreColor(s) {
  if (s >= 9) return '#00e5a0';
  if (s >= 7) return '#00b8ff';
  if (s >= 5) return '#ffaa00';
  if (s >= 3) return '#ff8c00';
  return '#ff6b6b';
}

const contentLabels = {
  10: 'Excellent', 9: 'Excellent', 8: 'Strong',
  7: 'Good', 6: 'Good', 5: 'Fair',
  4: 'Weak', 3: 'Weak', 2: 'Poor',
  1: 'Poor', 0: 'No Answer'
};