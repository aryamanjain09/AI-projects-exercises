'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let sessionId = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showPhase(n) {
  [1, 2, 3].forEach((i) => {
    $(`phase${i}`).classList.toggle('visible', i === n);
    const step = $(`step${i}`);
    if (i < n) step.classList.add('done'), step.classList.remove('active');
    else if (i === n) step.classList.add('active'), step.classList.remove('done');
    else step.classList.remove('active', 'done');
  });
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.add('visible');
}

function clearError(id) {
  const el = $(id);
  el.textContent = '';
  el.classList.remove('visible');
}

function setLoading(btnId, loading) {
  const btn = $(btnId);
  btn.disabled = loading;
  const spinner = btn.querySelector('.spinner');
  const label = btn.querySelector('.btn-label');
  if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
  if (label) label.textContent = loading ? btn.dataset.loadingText : btn.dataset.defaultText;
}

// ── Drop zone wiring ──────────────────────────────────────────────────────────
function wireDropZone(zoneId, inputId, labelId) {
  const zone = $(zoneId);
  const input = $(inputId);
  const label = $(labelId);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) { input.files = e.dataTransfer.files; label.textContent = file.name; }
  });
  input.addEventListener('change', () => {
    if (input.files[0]) label.textContent = input.files[0].name;
  });
}

// ── Template upload ───────────────────────────────────────────────────────────
async function uploadTemplate() {
  clearError('template-error');
  const file = $('template-input').files[0];
  if (!file) { showError('template-error', 'Please select a template file.'); return; }

  setLoading('template-btn', true);
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/template', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');

    sessionId = data.session_id;
    renderTemplateInfo(data);
    showPhase(2);
  } catch (err) {
    showError('template-error', err.message);
  } finally {
    setLoading('template-btn', false);
  }
}

function renderTemplateInfo(data) {
  const box = $('template-info');
  box.style.display = 'block';
  box.innerHTML = `
    <div class="info-title">Template parsed successfully</div>
    <div style="color:#166534;font-size:0.82rem;">
      Header at row <strong>${data.header_row}</strong>
      &nbsp;·&nbsp; ${data.leading_blank_rows} leading blank row(s)
      &nbsp;·&nbsp; ${data.leading_blank_cols} leading blank col(s)
    </div>
    <div class="col-list">
      ${data.column_names.map((c) => `<span class="col-tag">${escHtml(c)}</span>`).join('')}
    </div>`;

  // Also show a compact summary in phase 2
  $('active-template-name').textContent = `Template: ${data.column_names.length} column(s)`;
}

// ── Conversion ────────────────────────────────────────────────────────────────
async function convertFile() {
  clearError('convert-error');
  const file = $('source-input').files[0];
  if (!file) { showError('convert-error', 'Please select a source file.'); return; }
  if (!sessionId) { showError('convert-error', 'No template loaded. Please go back to Step 1.'); return; }

  setLoading('convert-btn', true);
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('session_id', sessionId);
    const res = await fetch('/api/convert', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) {
        // Session expired — reset to phase 1
        showError('convert-error', data.detail);
        setTimeout(() => resetToPhase1(), 2000);
        return;
      }
      throw new Error(data.detail || 'Conversion failed');
    }

    await triggerDownload(data.download_url, data.filename);
    renderResult(data.filename, data.warnings);
    showPhase(3);
  } catch (err) {
    showError('convert-error', err.message);
  } finally {
    setLoading('convert-btn', false);
  }
}

async function triggerDownload(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'converted.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function renderResult(filename, warnings) {
  $('result-filename').textContent = filename;

  const warnBox = $('warnings-box');
  if (warnings && warnings.length > 0) {
    warnBox.style.display = 'block';
    $('warnings-list').innerHTML = warnings.map((w) => `<li>${escHtml(w)}</li>`).join('');
  } else {
    warnBox.style.display = 'none';
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function resetToPhase1() {
  sessionId = null;
  $('template-input').value = '';
  $('template-file-label').textContent = 'No file chosen';
  const infoBox = $('template-info');
  infoBox.innerHTML = '';
  infoBox.style.display = 'none';
  clearError('template-error');
  showPhase(1);
}

function resetToPhase2() {
  $('source-input').value = '';
  $('source-file-label').textContent = 'No file chosen';
  clearError('convert-error');
  showPhase(2);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireDropZone('template-zone', 'template-input', 'template-file-label');
  wireDropZone('source-zone', 'source-input', 'source-file-label');
  showPhase(1);
});
