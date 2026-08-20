// ========== ステータス通知 ==========
const statusEl = document.getElementById('status');
function showStatus(msg, ms = 2000) {
  statusEl.textContent = msg;
  statusEl.classList.add('show');
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => statusEl.classList.remove('show'), ms);
}


// ========== リスト描画 ==========
function renderList() {
  const listEl = document.getElementById('circle-list');
  const badge = document.getElementById('count-badge');
  badge.textContent = circles.length > 0 ? `（${circles.length}）` : '';

  if (circles.length === 0) {
    listEl.innerHTML = '<div class="empty">まだ円がありません</div>';
    return;
  }

  listEl.innerHTML = circles.map(c => `
    <div class="circle-item">
      <div class="swatch" style="background:${c.color}"></div>
      <div class="info">
        <div class="label-text">${escapeHtml(c.label)}</div>
        <div class="meta">半径 ${formatRadius(c.radius)}　·　${c.center[0].toFixed(4)}, ${c.center[1].toFixed(4)}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" title="この円にズーム" onclick="zoomToCircle(${c.id})">⊕</button>
        <button class="icon-btn danger" title="削除" onclick="removeCircle(${c.id})">✕</button>
      </div>
    </div>
  `).join('');
}


// ========== 半径プリセット ==========
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRadius = parseInt(btn.dataset.radius);
    document.getElementById('custom-radius').value = '';
  });
});

document.getElementById('apply-custom').addEventListener('click', () => {
  const v = parseInt(document.getElementById('custom-radius').value);
  if (isNaN(v) || v < 50 || v > 50000) {
    showStatus('50〜50000mの範囲で入力してください');
    return;
  }
  currentRadius = v;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  showStatus(`カスタム半径：${formatRadius(v)} に設定`);
});

// ========== 色パレット ==========
document.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    currentColor = sw.dataset.color;
  });
});
