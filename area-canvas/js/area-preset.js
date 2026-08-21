// ========== エリアプリセット（AreaPresetSelector） ==========
// 表示範囲移動のための目安バウンディングボックス。行政界データ(administrative-boundary)を
// 生成した後は、実データから算出した範囲に置き換えることを推奨する（このボックス自体を
// 正式な行政界として描画・主張するものではない）。
(() => {
  const AREA_BOUNDS = {
    aichi: [[34.57, 136.68], [35.40, 137.85]],
    nagoya: [[35.05, 136.82], [35.25, 137.03]],
    owari: [[35.05, 136.70], [35.45, 137.10]],
    chita: [[34.75, 136.80], [35.05, 137.05]],
    nishimikawa: [[34.75, 137.00], [35.30, 137.35]],
  };
  const AREA_LABELS = {
    aichi: '愛知県全域',
    nagoya: '名古屋市',
    owari: '尾張',
    chita: '知多',
    nishimikawa: '西三河',
  };

  document.querySelectorAll('#area-preset-buttons [data-area]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bounds = AREA_BOUNDS[btn.dataset.area];
      if (!bounds) return;
      map.flyToBounds(bounds, { padding: [24, 24], duration: 0.6 });
      showStatus(`${AREA_LABELS[btn.dataset.area]}（目安範囲）へ移動`);
    });
  });
})();
