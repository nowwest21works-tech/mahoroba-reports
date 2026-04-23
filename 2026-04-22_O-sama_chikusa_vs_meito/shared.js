// ===== Shared Report Logic =====
const axes = [
  { key: 'commute',  label: '通勤・移動' },
  { key: 'edu',      label: '子育て・教育' },
  { key: 'life',     label: '生活利便' },
  { key: 'quiet',    label: '静けさ・環境' },
  { key: 'sunlight', label: '日照・快適性' },
  { key: 'build',    label: '家づくり自由度' },
  { key: 'safety',   label: '防災・安全' },
  { key: 'cost',     label: 'コスパ' }
];

// O様の重要度配分（Notion顧客DB＋Shadow Coach分析より導出）
// 日当たり重視・ハザード懸念・神丘中学校区・奥様駅近希望
const initialWeights = {
  commute: 4,   // 車通勤メインだが奥様駅近希望
  edu: 5,       // 神丘中学校区・小学生＋年中
  life: 4,      // 共働き医師家庭の時短
  quiet: 4,     // ご主人環境優位
  sunlight: 5,  // 明記「日当たり重視」
  build: 4,     // 注文住宅志向・38坪2F建て
  safety: 5,    // 明記「ハザード懸念少ないこと」
  cost: 3       // 医者夫婦・価値相応判断
};

function buildRadarChart(canvasId, objectiveScores, weights, propertyColor) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'radar',
    data: {
      labels: axes.map(a => a.label),
      datasets: [
        {
          label: '奥様・ご主人の重要度',
          data: axes.map(a => weights[a.key]),
          backgroundColor: 'rgba(239, 234, 224, 0.85)',
          borderColor: 'rgba(139, 135, 133, 0.6)',
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          order: 2
        },
        {
          label: '物件のスコア',
          data: axes.map(a => objectiveScores[a.key]),
          backgroundColor: propertyColor.fill,
          borderColor: propertyColor.line,
          borderWidth: 2,
          pointBackgroundColor: '#B5492C',
          pointBorderColor: '#F7F4EC',
          pointBorderWidth: 2,
          pointRadius: 4,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 5,
          ticks: { stepSize: 1, display: false, backdropColor: 'transparent' },
          grid: { color: 'rgba(139, 135, 133, 0.2)' },
          angleLines: { color: 'rgba(139, 135, 133, 0.25)' },
          pointLabels: {
            font: { family: 'Shippori Mincho, serif', size: 12, weight: '500' },
            color: '#3D3832'
          }
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    }
  });
}

function calcMatchScore(weights, scores) {
  let wsum = 0, wmax = 0;
  for (const a of axes) {
    wsum += weights[a.key] * scores[a.key];
    wmax += weights[a.key] * 5;
  }
  return Math.round((wsum / wmax) * 100);
}

function initSliders(containerId, chart, scores, onUpdate) {
  const container = document.getElementById(containerId);
  const hint = container.querySelector('.slider-mode-hint');
  axes.forEach((a, i) => {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <div class="slider-head">
        <span class="slider-name">${a.label}</span>
        <span class="slider-val" id="val-${a.key}">${initialWeights[a.key]}</span>
      </div>
      <input type="range" min="1" max="5" step="1" value="${initialWeights[a.key]}" id="slider-${a.key}">
    `;
    container.insertBefore(row, hint);
    row.querySelector('input').addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      document.getElementById(`val-${a.key}`).textContent = v;
      chart.data.datasets[0].data[i] = v;
      chart.update('none');
      onUpdate();
    });
  });
}

function resetAllSliders(chart, onUpdate) {
  axes.forEach((a, i) => {
    document.getElementById(`slider-${a.key}`).value = initialWeights[a.key];
    document.getElementById(`val-${a.key}`).textContent = initialWeights[a.key];
    chart.data.datasets[0].data[i] = initialWeights[a.key];
  });
  chart.update();
  onUpdate();
}
