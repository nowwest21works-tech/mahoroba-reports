// ========== 住所検索（Nominatim, OpenStreetMap）==========
async function searchAddress(query) {
  if (!query.trim()) return;
  showStatus('検索中...');
  try {
    // 注：Accept-Language ヘッダーを使うとCORSプリフライトが走るため、
    // URLクエリパラメータで言語指定（simple requestに保つ）
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=jp&limit=1&accept-language=ja`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.length === 0) {
      showStatus('見つかりませんでした。地名・駅名・住所を試してください');
      return;
    }
    const { lat, lon, display_name } = data[0];
    const lt = parseFloat(lat), lg = parseFloat(lon);
    map.setView([lt, lg], 15);
    const labelInput = document.getElementById('label-input');
    if (!labelInput.value.trim()) labelInput.value = query;
    addCircle(lt, lg);
    showStatus(`「${display_name.split(',')[0]}」に移動しました`);
  } catch (err) {
    console.error('Search error:', err);
    showStatus('検索エラー：file:// 環境では制限あり。Web公開版でお試しください', 4000);
  }
}

document.getElementById('search-btn').addEventListener('click', () => {
  searchAddress(document.getElementById('search-input').value);
});
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchAddress(document.getElementById('search-input').value);
});
