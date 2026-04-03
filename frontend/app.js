'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let sessionId = null;
let templateColumns = [];   // ordered template column names, for reset-to-auto
let groupStates = [];       // [{group_id, file_names, source_columns, mapping:[...]}]
let selectedSourceFiles = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showPhase(n) {
  [1, 2, 3, 4].forEach((i) => {
    $(`phase${i}`).classList.toggle('visible', i === n);
    const step = $(`step${i}`);
    if (i < n) { step.classList.add('done'); step.classList.remove('active'); }
    else if (i === n) { step.classList.add('active'); step.classList.remove('done'); }
    else { step.classList.remove('active', 'done'); }
  });
}

function showError(id, msg) { const el = $(id); el.textContent = msg; el.classList.add('visible'); }
function clearError(id) { const el = $(id); el.textContent = ''; el.classList.remove('visible'); }

function setLoading(btnId, loading) {
  const btn = $(btnId);
  btn.disabled = loading;
  btn.querySelector('.spinner').style.display = loading ? 'inline-block' : 'none';
  btn.querySelector('.btn-label').textContent =
    loading ? btn.dataset.loadingText : btn.dataset.defaultText;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ── Drop zone wiring ──────────────────────────────────────────────────────────
function wireDropZone(zoneId, inputId, onFilesSelected) {
  const zone = $(zoneId);
  const input = $(inputId);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; onFilesSelected(input.files); }
  });
  input.addEventListener('change', () => onFilesSelected(input.files));
}

// ── Phase 1: Template upload ──────────────────────────────────────────────────
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
    templateColumns = data.column_names;
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
  $('active-template-badge').textContent =
    `${data.column_names.length} column(s) · header row ${data.header_row}`;
}

// ── Phase 2: Source file selection ────────────────────────────────────────────
function onSourceFilesSelected(files) {
  selectedSourceFiles = files;
  const list = $('selected-files-list');
  if (!files.length) { list.textContent = 'No files chosen'; return; }
  list.innerHTML = Array.from(files)
    .map((f) => `<div class="file-item">📊 <strong>${escHtml(f.name)}</strong>
      <span class="file-size">${formatSize(f.size)}</span></div>`)
    .join('');
}

async function previewMapping() {
  clearError('source-error');
  if (!selectedSourceFiles || !selectedSourceFiles.length) {
    showError('source-error', 'Please select at least one source file.'); return;
  }
  setLoading('preview-btn', true);
  try {
    const form = new FormData();
    form.append('session_id', sessionId);
    for (const f of selectedSourceFiles) form.append('files', f);
    const res = await fetch('/api/preview', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 404) { resetToPhase1(); return; }
      throw new Error(data.detail || 'Preview failed');
    }
    groupStates = data.groups.map((g) => ({
      group_id: g.group_id,
      file_names: g.file_names,
      source_columns: g.source_columns,
      mapping: g.mapping.map((m) => ({ ...m })),
    }));
    renderMappingPanels();
    updateMappingSummary();
    showPhase(3);
  } catch (err) {
    showError('source-error', err.message);
  } finally {
    setLoading('preview-btn', false);
  }
}

// ── Phase 3: Mapping panels ───────────────────────────────────────────────────
function updateMappingSummary() {
  const totalFiles = groupStates.reduce((s, g) => s + g.file_names.length, 0);
  const totalGroups = groupStates.length;
  $('mapping-summary').textContent =
    `${totalFiles} file(s) · ${totalGroups} group(s) — review and adjust mappings below`;
}

function renderMappingPanels() {
  $('mapping-container').innerHTML =
    groupStates.map((g, gi) => buildGroupPanelHtml(g, gi)).join('');
}

function buildGroupPanelHtml(group, gi) {
  const fileList = group.file_names.map((f) => escHtml(f)).join(', ');
  const templateOnlyCols = group.mapping.filter((m) => !m.is_extra);
  const mappedCount = templateOnlyCols.filter((m) => m.source_col).length;
  const totalTemplate = templateOnlyCols.length;
  const usedSource = new Set(group.mapping.map((m) => m.source_col).filter(Boolean));
  const unusedCols = group.source_columns.filter((c) => !usedSource.has(c));

  const rows = group.mapping.map((m, mi) => buildRowHtml(group, gi, m, mi)).join('');

  const unusedHtml = unusedCols.length
    ? `<div class="unused-cols" id="unused-${gi}">
        Unused source columns:
        ${unusedCols.map((c) => `<span class="unused-tag">${escHtml(c)}</span>`).join('')}
       </div>`
    : `<div class="unused-cols" id="unused-${gi}" style="display:none;"></div>`;

  return `
    <div class="group-panel">
      <div class="group-header">
        <div>
          <span class="group-badge">Group ${gi + 1}</span>
          <span class="group-files">${fileList}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="map-count ${mappedCount < totalTemplate ? 'has-unmapped' : ''}" id="map-count-${gi}">
            ${mappedCount}/${totalTemplate} mapped
          </span>
          <button class="btn btn-sm btn-secondary" onclick="resetGroupMapping(${gi})">Reset to auto</button>
        </div>
      </div>

      <table class="mapping-table">
        <thead>
          <tr>
            <th style="width:36%">Output column</th>
            <th style="width:8%;text-align:center;">↔</th>
            <th style="width:46%">Source column</th>
            <th style="width:10%"></th>
          </tr>
        </thead>
        <tbody id="mapping-body-${gi}">${rows}</tbody>
      </table>

      ${unusedHtml}

      <button class="btn-add" onclick="addExtraColumn(${gi})">＋ Add source column to output</button>
    </div>`;
}

function buildRowHtml(group, gi, m, mi) {
  const sourceOpts = buildSourceOptions(group.source_columns, m.source_col);
  const isExtra = m.is_extra;

  const nameCell = isExtra
    ? `<input class="col-name-input" value="${escHtml(m.output_col)}" placeholder="Column name"
             onchange="onNameChange(${gi},${mi},this.value)" />`
    : `<span class="col-name-fixed ${m.source_col ? 'mapped' : 'unmapped'}">${escHtml(m.output_col)}</span>`;

  const arrowClass = m.source_col ? 'mapped-arrow' : 'empty-arrow';
  const arrowChar  = m.source_col ? '→' : '·';

  const deleteBtn = isExtra
    ? `<button class="btn-icon-del" onclick="removeExtraColumn(${gi},${mi})" title="Remove">✕</button>`
    : '';

  return `
    <tr data-gi="${gi}" data-mi="${mi}" data-extra="${isExtra}">
      <td>${nameCell}</td>
      <td style="text-align:center;"><span class="arrow ${arrowClass}">${arrowChar}</span></td>
      <td><select onchange="onMappingChange(${gi},${mi},this)">${sourceOpts}</select></td>
      <td>${deleteBtn}</td>
    </tr>`;
}

function buildSourceOptions(sourceColumns, selected) {
  const blank = `<option value="">— leave blank —</option>`;
  return blank + sourceColumns
    .map((c) => `<option value="${escHtml(c)}"${c === selected ? ' selected' : ''}>${escHtml(c)}</option>`)
    .join('');
}

// ── Mapping interaction handlers ──────────────────────────────────────────────
function onNameChange(gi, mi, value) {
  groupStates[gi].mapping[mi].output_col = value || 'Column';
}

function onMappingChange(gi, mi, select) {
  groupStates[gi].mapping[mi].source_col = select.value || null;

  // Update arrow and column name colour in-place (no full re-render)
  const row = select.closest('tr');
  const arrow = row.querySelector('.arrow');
  const nameSpan = row.querySelector('.col-name-fixed');
  if (select.value) {
    arrow.className = 'arrow mapped-arrow'; arrow.textContent = '→';
    if (nameSpan) { nameSpan.classList.remove('unmapped'); nameSpan.classList.add('mapped'); }
  } else {
    arrow.className = 'arrow empty-arrow'; arrow.textContent = '·';
    if (nameSpan) { nameSpan.classList.remove('mapped'); nameSpan.classList.add('unmapped'); }
  }
  updateUnusedCols(gi);
  updateMappedCount(gi);
}

function updateUnusedCols(gi) {
  const group = groupStates[gi];
  const used = new Set(group.mapping.map((m) => m.source_col).filter(Boolean));
  const unused = group.source_columns.filter((c) => !used.has(c));
  const el = $(`unused-${gi}`);
  if (!el) return;
  if (unused.length) {
    el.style.display = '';
    el.innerHTML = `Unused source columns: ${unused.map((c) => `<span class="unused-tag">${escHtml(c)}</span>`).join('')}`;
  } else {
    el.style.display = 'none';
  }
}

function updateMappedCount(gi) {
  const group = groupStates[gi];
  const templateOnly = group.mapping.filter((m) => !m.is_extra);
  const mapped = templateOnly.filter((m) => m.source_col).length;
  const el = $(`map-count-${gi}`);
  if (!el) return;
  el.textContent = `${mapped}/${templateOnly.length} mapped`;
  el.className = `map-count${mapped < templateOnly.length ? ' has-unmapped' : ''}`;
}

// ── Capture state before re-renders ──────────────────────────────────────────
function captureGroupState(gi) {
  const body = $(`mapping-body-${gi}`);
  if (!body) return;
  body.querySelectorAll('tr').forEach((row, mi) => {
    if (mi >= groupStates[gi].mapping.length) return;
    const nameInput = row.querySelector('.col-name-input');
    if (nameInput) groupStates[gi].mapping[mi].output_col = nameInput.value || 'Column';
    const sel = row.querySelector('select');
    if (sel) groupStates[gi].mapping[mi].source_col = sel.value || null;
  });
}

// ── Add / remove extra columns ────────────────────────────────────────────────
function addExtraColumn(gi) {
  captureGroupState(gi);
  const group = groupStates[gi];
  const used = new Set(group.mapping.map((m) => m.source_col).filter(Boolean));
  const firstUnused = group.source_columns.find((c) => !used.has(c)) || null;
  group.mapping.push({
    output_col: firstUnused || 'New Column',
    source_col: firstUnused,
    is_extra: true,
  });
  renderMappingPanels();
}

function removeExtraColumn(gi, mi) {
  captureGroupState(gi);
  groupStates[gi].mapping.splice(mi, 1);
  renderMappingPanels();
}

function resetGroupMapping(gi) {
  captureGroupState(gi);
  const group = groupStates[gi];
  const sourceSet = new Set(group.source_columns);
  // Rebuild: template columns only, no extras
  group.mapping = templateColumns.map((col) => ({
    output_col: col,
    source_col: sourceSet.has(col) ? col : null,
    is_extra: false,
  }));
  renderMappingPanels();
}

// ── Convert ───────────────────────────────────────────────────────────────────
async function convertAll() {
  clearError('mapping-error');
  groupStates.forEach((_, gi) => captureGroupState(gi));
  setLoading('convert-btn', true);
  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        mappings: groupStates.map((g) => ({
          group_id: g.group_id,
          mapping: g.mapping,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 404) { resetToPhase1(); return; }
      throw new Error(data.detail || 'Conversion failed');
    }
    await triggerDownload(data.download_url, data.filename);
    renderResult(data.filename, data.warnings);
    showPhase(4);
  } catch (err) {
    showError('mapping-error', err.message);
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
  if (warnings && warnings.length) {
    warnBox.style.display = 'block';
    $('warnings-list').innerHTML = warnings.map((w) => `<li>${escHtml(w)}</li>`).join('');
  } else {
    warnBox.style.display = 'none';
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function resetToPhase1() {
  sessionId = null; templateColumns = []; groupStates = []; selectedSourceFiles = null;
  $('template-input').value = '';
  $('template-file-label').textContent = 'No file chosen';
  const box = $('template-info'); box.innerHTML = ''; box.style.display = 'none';
  clearError('template-error');
  showPhase(1);
}

function resetToPhase2() {
  $('source-input').value = '';
  selectedSourceFiles = null;
  $('selected-files-list').textContent = 'No files chosen';
  clearError('source-error');
  showPhase(2);
}

function resetToPhase3() {
  if (groupStates.length) { renderMappingPanels(); showPhase(3); }
  else { resetToPhase2(); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireDropZone('template-zone', 'template-input', (files) => {
    $('template-file-label').textContent = files[0]?.name || 'No file chosen';
  });
  wireDropZone('source-zone', 'source-input', onSourceFilesSelected);
  showPhase(1);
});
