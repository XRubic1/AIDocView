/**
 * Standalone browser window for reviewing managed handoff documents.
 *
 * Renders a self-contained HTML page (own document + inline script) that shows a
 * navigable document list on the left and a preview on the right. The window can
 * be dragged to another monitor/desktop like any native browser window.
 */

export interface HandoffWindowDoc {
  id: string
  name: string
  /** Object URL (blob:) created by the opener; valid while the opener lives. */
  url: string
  type: string
  /** Document is attached to an invoice already added to the queue. */
  assigned: boolean
  /** Document is currently selected for the invoice being built. */
  selected: boolean
}

export interface HandoffWindowPayload {
  title: string
  docs: HandoffWindowDoc[]
  activeId: string | null
}

/** Message channel name so opener and window agree on update events. */
const UPDATE_MESSAGE_TYPE = 'handoff-docs-update'
/** Message from window → opener when the active document changes. */
export const ACTIVE_MESSAGE_TYPE = 'handoff-doc-active'
/** Message from window → opener to toggle a document's invoice selection. */
export const TOGGLE_MESSAGE_TYPE = 'handoff-doc-toggle'

/** Escape a value for safe embedding inside a <script> JSON literal. */
function serializeForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** Build the full HTML document for the popup window. */
function buildWindowHtml(payload: HandoffWindowPayload): string {
  const initialData = serializeForScript({
    docs: payload.docs,
    activeId: payload.activeId,
    updateType: UPDATE_MESSAGE_TYPE,
    activeType: ACTIVE_MESSAGE_TYPE,
    toggleType: TOGGLE_MESSAGE_TYPE,
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${payload.title.replace(/</g, '&lt;')}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #113543; }
    .wrap { display: flex; height: 100vh; }
    .sidebar { width: 280px; min-width: 220px; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; background: #f8fafc; }
    .side-head { padding: 12px 14px; font-size: 13px; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
    ul { list-style: none; margin: 0; padding: 8px; overflow-y: auto; flex: 1; }
    li { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: #fff; transition: border-color .15s, background .15s; }
    li:hover { border-color: #cbd5e1; }
    li.active { border-color: #2563eb; background: #eff6ff; }
    li.selected { border-color: #2563eb; background: #dbeafe; }
    li.active.selected { border-color: #1d4ed8; }
    .doc-row { display: flex; align-items: flex-start; gap: 8px; }
    .doc-row input { margin-top: 2px; cursor: pointer; }
    .doc-name { font-size: 13px; font-weight: 500; word-break: break-word; flex: 1; }
    .badge { align-self: flex-start; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; margin-left: 26px; }
    .badge.assigned { background: #dcfce7; color: #166534; }
    .badge.selected { background: #dbeafe; color: #1e40af; }
    .badge.unassigned { background: #fef3c7; color: #92400e; }
    .viewer { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; }
    .toolbar button { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 5px 10px; font-size: 13px; cursor: pointer; }
    .toolbar button:disabled { opacity: .4; cursor: not-allowed; }
    .counter { font-size: 13px; color: #6b7280; font-variant-numeric: tabular-nums; }
    .doc-title { font-size: 13px; font-weight: 600; margin-left: auto; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stage { flex: 1; min-height: 0; background: #f3f4f6; }
    .stage iframe { width: 100%; height: 100%; border: 0; background: #fff; }
    .stage img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
    .empty { height: 100%; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <aside class="sidebar">
      <div class="side-head" id="sideHead">Documents</div>
      <ul id="list"></ul>
    </aside>
    <main class="viewer">
      <div class="toolbar">
        <button id="prev" type="button">&#8249; Prev</button>
        <span class="counter" id="counter">0 / 0</span>
        <button id="next" type="button">Next &#8250;</button>
        <span class="doc-title" id="title"></span>
      </div>
      <div class="stage" id="stage"><div class="empty">Select a document</div></div>
    </main>
  </div>
  <script>
    (function () {
      var initial = ${initialData};
      var UPDATE_TYPE = initial.updateType;
      var ACTIVE_TYPE = initial.activeType;
      var TOGGLE_TYPE = initial.toggleType;
      var docs = initial.docs || [];
      var idx = 0;

      function postToOpener(type, id) {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: type, id: id }, '*');
        }
      }
      if (initial.activeId) {
        var found = docs.findIndex(function (d) { return d.id === initial.activeId; });
        if (found >= 0) idx = found;
      }

      var listEl = document.getElementById('list');
      var stageEl = document.getElementById('stage');
      var titleEl = document.getElementById('title');
      var counterEl = document.getElementById('counter');
      var sideHead = document.getElementById('sideHead');
      var prevBtn = document.getElementById('prev');
      var nextBtn = document.getElementById('next');

      function esc(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
      }

      function renderList() {
        sideHead.textContent = 'Documents (' + docs.length + ')';
        listEl.innerHTML = docs.map(function (d, i) {
          var badge = d.assigned
            ? '<span class="badge assigned">Assigned</span>'
            : d.selected
              ? '<span class="badge selected">Selected</span>'
              : '<span class="badge unassigned">Unassigned</span>';
          var classes = [];
          if (i === idx) classes.push('active');
          if (d.selected) classes.push('selected');
          var checkbox = '<input type="checkbox" class="pick" data-i="' + i + '"' +
            (d.selected ? ' checked' : '') + (d.assigned ? ' disabled' : '') + ' />';
          return '<li data-i="' + i + '" class="' + classes.join(' ') + '">' +
            '<div class="doc-row">' + checkbox +
            '<span class="doc-name">' + esc(d.name) + '</span></div>' + badge + '</li>';
        }).join('');
        Array.prototype.forEach.call(listEl.children, function (li) {
          li.addEventListener('click', function () {
            idx = parseInt(li.getAttribute('data-i'), 10);
            renderAll();
            var d = docs[idx];
            if (d) postToOpener(ACTIVE_TYPE, d.id);
          });
        });
        Array.prototype.forEach.call(listEl.querySelectorAll('.pick'), function (cb) {
          cb.addEventListener('click', function (ev) { ev.stopPropagation(); });
          cb.addEventListener('change', function () {
            var i = parseInt(cb.getAttribute('data-i'), 10);
            var d = docs[i];
            if (d) postToOpener(TOGGLE_TYPE, d.id);
          });
        });
      }

      function renderStage() {
        var d = docs[idx];
        counterEl.textContent = docs.length ? (idx + 1) + ' / ' + docs.length : '0 / 0';
        titleEl.textContent = d ? d.name : '';
        prevBtn.disabled = idx <= 0;
        nextBtn.disabled = idx < 0 || idx >= docs.length - 1;
        if (!d) { stageEl.innerHTML = '<div class="empty">No documents</div>'; return; }
        var ext = (d.name.split('.').pop() || '').toLowerCase();
        var isPdf = (d.type && d.type.indexOf('pdf') !== -1) || ext === 'pdf';
        var isImg = (d.type && d.type.indexOf('image/') === 0) ||
          ['png', 'jpg', 'jpeg', 'gif', 'webp'].indexOf(ext) !== -1;
        if (isPdf) stageEl.innerHTML = '<iframe src="' + d.url + '"></iframe>';
        else if (isImg) stageEl.innerHTML = '<img src="' + d.url + '" alt="' + esc(d.name) + '">';
        else stageEl.innerHTML = '<div class="empty">Preview not supported — download to view.</div>';
      }

      function renderAll() { renderList(); renderStage(); }

      prevBtn.addEventListener('click', function () {
        if (idx > 0) { idx--; renderAll(); if (docs[idx]) postToOpener(ACTIVE_TYPE, docs[idx].id); }
      });
      nextBtn.addEventListener('click', function () {
        if (idx < docs.length - 1) { idx++; renderAll(); if (docs[idx]) postToOpener(ACTIVE_TYPE, docs[idx].id); }
      });

      window.addEventListener('message', function (e) {
        if (!e.data || e.data.type !== UPDATE_TYPE) return;
        docs = e.data.docs || [];
        if (e.data.activeId) {
          var i = docs.findIndex(function (d) { return d.id === e.data.activeId; });
          if (i >= 0) idx = i;
        }
        if (idx >= docs.length) idx = Math.max(0, docs.length - 1);
        renderAll();
      });

      renderAll();
    })();
  </script>
</body>
</html>`
}

/**
 * Open (or focus) the standalone handoff document window.
 * Returns the window handle, or null if the popup was blocked.
 */
export function openHandoffDocWindow(
  payload: HandoffWindowPayload,
  existing?: Window | null
): Window | null {
  const target =
    existing && !existing.closed
      ? existing
      : window.open('', 'handoff-doc-window', 'width=1100,height=850')

  if (!target) return null

  target.document.open()
  target.document.write(buildWindowHtml(payload))
  target.document.close()
  target.focus()
  return target
}

/** Push updated document state (assignment/active changes) into an open window. */
export function updateHandoffDocWindow(
  win: Window | null,
  docs: HandoffWindowDoc[],
  activeId: string | null
): void {
  if (!win || win.closed) return
  win.postMessage({ type: UPDATE_MESSAGE_TYPE, docs, activeId }, '*')
}
