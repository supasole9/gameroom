const $ = (id) => document.getElementById(id);
const gallery = $('gallery');
const editor = $('editor');

let list = [];
async function loadList() {
  list = await (await fetch('/api/characters')).json();
  renderGallery();
}
function renderGallery() {
  gallery.innerHTML = '';
  if (!list.length) {
    gallery.innerHTML = '<p class="cm-empty">No characters yet — tap “Add a character”.</p>';
    return;
  }
  for (const c of list) {
    const card = document.createElement('div');
    card.className = 'cm-card';
    card.innerHTML = `<div class="cm-thumb"><img src="${c.url}" alt=""></div><div class="cm-name-lbl">${escapeHtml(c.name)}</div>`;
    const row = document.createElement('div');
    row.className = 'cm-card-btns';
    const edit = document.createElement('button');
    edit.className = 'btn-secondary'; edit.textContent = '✏️ Edit';
    edit.addEventListener('click', () => openEditor(c));
    const del = document.createElement('button');
    del.className = 'btn-secondary'; del.textContent = '🗑️';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete ${c.name}?`)) return;
      await fetch('/api/characters/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: c.file }) });
      loadList();
    });
    row.append(edit, del);
    card.appendChild(row);
    gallery.appendChild(card);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Editor ----------
const canvas = $('edCanvas');
const ctx = canvas.getContext('2d');
const SIZE = 320;
let img = null, processed = null, scale = 1, rot = 0, flip = 1, ox = 0, oy = 0, replaceFile = null;

function eraseBackground(source, strength) {
  const c = document.createElement('canvas');
  c.width = source.width; c.height = source.height;
  const x = c.getContext('2d');
  x.drawImage(source, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const thresh = 255 - strength * 130; // higher strength = remove more
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i], g = a[i + 1], b = a[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mn >= thresh && (mx - mn) <= 45) a[i + 3] = 0;
  }
  x.putImageData(d, 0, 0);
  return c;
}
function reprocess() {
  if (!img) { processed = null; return; }
  processed = $('edErase').checked ? eraseBackground(img, parseFloat($('edStrength').value)) : img;
}
function renderTo(c2d, size) {
  c2d.clearRect(0, 0, size, size);
  // soft checker so transparency is visible
  c2d.fillStyle = 'rgba(255,255,255,.06)';
  c2d.fillRect(0, 0, size, size);
  const src = processed || img;
  if (!src) return;
  const k = size / SIZE;
  c2d.save();
  c2d.translate(size / 2 + ox * k, size / 2 + oy * k);
  c2d.rotate(rot * Math.PI / 180);
  c2d.scale(scale * flip * k, scale * k);
  c2d.drawImage(src, -src.width / 2, -src.height / 2);
  c2d.restore();
}
const draw = () => renderTo(ctx, SIZE);

function resetTransform() {
  if (img) scale = Math.min(260 / img.width, 260 / img.height) || 1; else scale = 1;
  rot = 0; flip = 1; ox = 0; oy = 0;
  $('edScale').value = String(scale); $('edRot').value = '0';
  draw();
}

function openEditor(existing) {
  editor.classList.remove('hide');
  $('edMsg').textContent = '';
  $('edErase').checked = false; $('edStrength').disabled = true; $('edStrength').value = '0.5'; $('edStrengthRow').style.opacity = .5;
  img = null; processed = null; replaceFile = null;
  if (existing) {
    $('edTitle').textContent = 'Edit: ' + existing.name;
    $('edName').value = existing.name;
    replaceFile = existing.file;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { img = im; reprocess(); resetTransform(); };
    im.src = existing.url + '?t=' + Date.now();
  } else {
    $('edTitle').textContent = 'New character';
    $('edName').value = '';
    resetTransform();
  }
  editor.scrollIntoView({ behavior: 'smooth' });
}

$('addBtn').addEventListener('click', () => openEditor(null));
$('edFile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { img = im; reprocess(); resetTransform(); }; im.src = r.result; };
  r.readAsDataURL(f);
});
$('edScale').addEventListener('input', (e) => { scale = parseFloat(e.target.value); draw(); });
$('edRot').addEventListener('input', (e) => { rot = parseFloat(e.target.value); draw(); });
$('edFlip').addEventListener('click', () => { flip *= -1; draw(); });
$('edReset').addEventListener('click', resetTransform);
$('edErase').addEventListener('change', (e) => {
  $('edStrength').disabled = !e.target.checked;
  $('edStrengthRow').style.opacity = e.target.checked ? 1 : .5;
  reprocess(); draw();
});
$('edStrength').addEventListener('input', () => { reprocess(); draw(); });

// drag to reposition
let dragging = false, lx = 0, ly = 0;
const pt = (e) => { const t = e.touches ? e.touches[0] : e; const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) * (SIZE / r.width), y: (t.clientY - r.top) * (SIZE / r.height) }; };
const down = (e) => { dragging = true; const p = pt(e); lx = p.x; ly = p.y; };
const move = (e) => { if (!dragging) return; const p = pt(e); ox += p.x - lx; oy += p.y - ly; lx = p.x; ly = p.y; draw(); if (e.cancelable) e.preventDefault(); };
const up = () => { dragging = false; };
canvas.addEventListener('mousedown', down);
window.addEventListener('mousemove', move);
window.addEventListener('mouseup', up);
canvas.addEventListener('touchstart', (e) => { down(e); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', move, { passive: false });
canvas.addEventListener('touchend', up);

$('edCancel').addEventListener('click', () => editor.classList.add('hide'));
$('edSave').addEventListener('click', async () => {
  const name = $('edName').value.trim();
  if (!name) { $('edMsg').textContent = 'Give your character a name.'; return; }
  if (!img) { $('edMsg').textContent = 'Choose a photo first.'; return; }
  const out = document.createElement('canvas');
  out.width = 512; out.height = 512;
  renderTo(out.getContext('2d'), 512);
  const dataUrl = out.toDataURL('image/png');
  $('edSave').disabled = true; $('edMsg').textContent = 'Saving…';
  const res = await fetch('/api/characters', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, dataUrl, replace: replaceFile }),
  });
  $('edSave').disabled = false;
  const j = await res.json();
  if (!res.ok) { $('edMsg').textContent = j.error || 'Could not save.'; return; }
  editor.classList.add('hide');
  loadList();
});

loadList();
