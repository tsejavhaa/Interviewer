/* ═══════════════════════════════════════════════════════════════
   DATABASE BUILDER
═══════════════════════════════════════════════════════════════ */

function openDB() {
  document.getElementById('db-overlay').classList.add('open');
  dbLoad();
}
function closeDB() {
  document.getElementById('db-overlay').classList.remove('open');
  dbCancelEdit();
}
document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('db-overlay');
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) closeDB(); });
});

async function dbLoad() {
  try {
    const [records, stats] = await Promise.all([
      fetch(`${API}/db/records`).then(r => r.json()),
      fetch(`${API}/db/stats`).then(r => r.json()),
    ]);
    _dbRecords  = records;
    _dbFiltered = records;
    dbRenderStats(stats);
    dbRenderTable(_dbRecords);
    dbUpdateFab(stats.total);
    dbPopulateRoles(records);
  } catch(e) {
    document.getElementById('db-tbody').innerHTML =
      '<tr><td colspan="5" class="db-empty">⚠ Could not load database</td></tr>';
  }
}

function dbRenderStats(stats) {
  document.getElementById('db-stat-line').textContent =
    `${stats.total} records · ${Object.keys(stats.by_role).length} roles`;
  const row = document.getElementById('db-stats-row');
  const chips = Object.entries(stats.by_role)
    .sort((a,b) => b[1]-a[1])
    .map(([r,n]) => `<span class="db-stat-chip"><strong>${n}</strong> ${r||'Untagged'}</span>`)
    .join('');
  row.innerHTML = chips || '<span style="color:var(--muted)">No records yet — add one!</span>';
}

function dbUpdateFab(count) {
  const el = document.getElementById('db-fab-count');
  if (el) el.textContent = count;
}

function dbPopulateRoles(records) {
  const roles = [...new Set(records.map(r => r.role).filter(Boolean))];
  const dl = document.getElementById('db-role-list');
  if (dl) dl.innerHTML = roles.map(r => `<option value="${escHtml(r)}">`).join('');
}

function dbFilter() {
  const search = (document.getElementById('db-search').value || '').toLowerCase();
  const diff   =  document.getElementById('db-filter-diff').value || '';
  _dbFiltered = _dbRecords.filter(r => {
    const ms = !search ||
      r.question.toLowerCase().includes(search) ||
      r.answer.toLowerCase().includes(search) ||
      (r.role||'').toLowerCase().includes(search) ||
      (r.tags||[]).some(t => t.toLowerCase().includes(search));
    const md = !diff || r.difficulty === diff;
    return ms && md;
  });
  dbRenderTable(_dbFiltered);
}

function dbRenderTable(records) {
  const tbody  = document.getElementById('db-tbody');
  const footer = document.getElementById('db-table-footer');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="db-empty">No records found</td></tr>';
    footer.textContent = '';
    return;
  }
  tbody.innerHTML = records.map(r => {
    const diff = r.difficulty || '';
    const diffBadge = diff
      ? `<span class="db-diff-badge ${diff}">${diff}</span>`
      : '<span style="color:var(--muted)">—</span>';
    const tags = (r.tags||[]).map(t => `<span class="db-tag">${escHtml(t)}</span>`).join('');
    const date = (r.created_at||'').split('T')[0];
    return `<tr>
      <td><div class="db-q-text">${escHtml(r.question)}</div><div style="margin-top:3px">${tags}</div></td>
      <td><div class="db-a-text">${escHtml(r.answer)}</div></td>
      <td style="font-size:9px;color:var(--sub)">${escHtml(r.role||'—')}</td>
      <td>${diffBadge}</td>
      <td>
        <div class="db-actions">
          <button class="db-act-btn" onclick="dbStartEdit('${r.id}')" title="Edit">✏</button>
          <button class="db-act-btn del" onclick="dbDelete('${r.id}')" title="Delete">🗑</button>
        </div>
        <div style="color:var(--muted);font-size:8px;margin-top:3px">${date}</div>
      </td>
    </tr>`;
  }).join('');
  footer.textContent = `Showing ${records.length} of ${_dbRecords.length} records`;
}

async function dbSave() {
  const question = document.getElementById('db-q').value.trim();
  const answer   = document.getElementById('db-a').value.trim();
  const role     = document.getElementById('db-role').value.trim();
  const diff     = document.getElementById('db-diff').value;
  const tags     = document.getElementById('db-tags').value.trim();
  const editId   = document.getElementById('db-edit-id').value;
  if (!question || !answer) { dbShowMsg('⚠ Question and Answer are required','var(--warn)'); return; }
  const fd = new FormData();
  fd.append('question', question); fd.append('answer', answer);
  fd.append('role', role); fd.append('difficulty', diff); fd.append('tags', tags);
  try {
    const res = await fetch(
      editId ? `${API}/db/records/${editId}` : `${API}/db/records`,
      { method: editId ? 'PUT' : 'POST', body: fd }
    );
    if (!res.ok) throw new Error(await res.text());
    dbShowMsg(editId ? '✓ Updated' : '✓ Saved');
    dbCancelEdit(); dbLoad();
  } catch(e) { dbShowMsg('⚠ ' + e.message, 'var(--warn)'); }
}

function dbStartEdit(id) {
  const r = _dbRecords.find(x => x.id === id);
  if (!r) return;
  _dbEditMode = true;
  document.getElementById('db-edit-id').value  = r.id;
  document.getElementById('db-q').value        = r.question;
  document.getElementById('db-a').value        = r.answer;
  document.getElementById('db-role').value     = r.role || '';
  document.getElementById('db-diff').value     = r.difficulty || '';
  document.getElementById('db-tags').value     = (r.tags||[]).join(', ');
  document.getElementById('db-form-title').textContent = '✏ Edit Record';
  document.getElementById('db-cancel-edit-btn').style.display = '';
  document.querySelector('.db-form-col').scrollTop = 0;
}

function dbCancelEdit() {
  _dbEditMode = false;
  ['db-edit-id','db-q','db-a','db-role','db-tags'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('db-diff').value = '';
  document.getElementById('db-form-title').textContent = '➕ Add New Record';
  document.getElementById('db-cancel-edit-btn').style.display = 'none';
  document.getElementById('db-msg').textContent = '';
}

async function dbDelete(id) {
  const r = _dbRecords.find(x => x.id === id);
  if (!r || !confirm(`Delete this record?\n\n"${r.question.slice(0,80)}"`) ) return;
  try {
    const res = await fetch(`${API}/db/records/${id}`, { method:'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    dbLoad();
  } catch(e) { alert('Delete failed: ' + e.message); }
}

function dbShowMsg(text, color='var(--accent)') {
  const el = document.getElementById('db-msg');
  el.textContent = text; el.style.color = color;
  setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
}

// Init FAB count on page load
fetch(`${API}/db/stats`).then(r=>r.json()).then(d => dbUpdateFab(d.total)).catch(()=>{});

async function dbImportJSON(input) {
  const file = input.files[0];
  if (!file) return;
  dbShowMsg('Importing…', 'var(--sub)');
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res  = await fetch(`${API}/db/import-json`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Import failed');
    dbShowMsg(`✓ Imported ${data.imported} questions${data.skipped ? ` (${data.skipped} skipped)` : ''}`);
    dbLoad();
  } catch(e) {
    dbShowMsg('⚠ ' + e.message, 'var(--warn)');
  }
  input.value = ''; // reset so same file can be re-imported
}

// Keyboard shortcut: Escape closes DB
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('db-overlay').classList.contains('open')) closeDB();
});

async function dbResetUsed() {
  if (!confirm('Reset used-questions history?\n\nAll questions will be available for selection again in future interviews.')) return;
  try {
    const res  = await fetch(`${API}/db/reset-used`, { method: 'POST' });
    const data = await res.json();
    dbShowMsg(`✓ ${data.message}`);
  } catch(e) {
    dbShowMsg('⚠ Reset failed', 'var(--warn)');
  }
}