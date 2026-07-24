// ========== マップクリック ==========
map.on('click', (e) => {
  addCircle(e.latlng.lat, e.latlng.lng);
});


// ========== 全削除（2段階クリック方式：confirmに依存しない） ==========
let clearArmed = false;
let clearArmedTimer = null;
const clearBtn = document.getElementById('clear-all');
const clearBtnOriginalText = clearBtn.textContent;

clearBtn.addEventListener('click', () => {
  if (circles.length === 0) {
    showStatus('削除する円がありません');
    return;
  }

  if (!clearArmed) {
    // 1回目：警告状態に
    clearArmed = true;
    clearBtn.textContent = `本当に削除？もう一度クリック（${circles.length}個）`;
    clearBtn.style.background = 'var(--accent)';
    clearBtn.style.color = 'white';
    clearBtn.style.borderColor = 'var(--accent)';
    showStatus('もう一度クリックで全削除（3秒で取消）', 3000);

    clearArmedTimer = setTimeout(() => {
      clearArmed = false;
      clearBtn.textContent = clearBtnOriginalText;
      clearBtn.style.background = '';
      clearBtn.style.color = '';
      clearBtn.style.borderColor = '';
    }, 3000);
    return;
  }

  // 2回目：実行
  clearTimeout(clearArmedTimer);
  const count = circles.length;
  circles.forEach(c => { map.removeLayer(c.circle); map.removeLayer(c.marker); });
  circles = [];
  renderList();
  clearArmed = false;
  clearBtn.textContent = clearBtnOriginalText;
  clearBtn.style.background = '';
  clearBtn.style.color = '';
  clearBtn.style.borderColor = '';
  showStatus(`${count}個の円をすべて削除しました`);
});

// ========== パネルトグル ==========
document.getElementById('toggle-panel').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 320);
});

// ========== 初期化 ==========
renderList();
showStatus('地図上をクリックして円を配置できます');

// グローバル公開（onclick用）
window.removeCircle = removeCircle;
window.zoomToCircle = zoomToCircle;
