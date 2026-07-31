import { useEffect, useMemo, useState } from "react";

import {
  CONFIDENCE_LABELS,
  INTERPRETATION_POINTS,
  POINT_IDS,
  UNCERTAINTY_NOTICE,
} from "./content";
import { MapView } from "./MapView";
import { decodeUrlState, encodeUrlState, setLayerVisibility, withCamera } from "./state";
import {
  LAYER_IDS,
  type InterpretationPoint,
  type LayerId,
  type SeaLevel,
  type UrlState,
} from "./types";

const LAYER_LABELS: Record<LayerId, string> = {
  land: "推定陸地",
  coast: "現在海岸線",
  cities: "現代主要都市",
  rivers: "現在主要河川",
  points: "解説ポイント",
  uncertainty: "不確実性ポイント",
};

const DISCLAIMER = [
  "この地図は、現在の陸上・海底地形と推定海水準から生成した概算モデルです。約2万年前の地表面を直接復元したものではありません。",
  "当時の地殻変動、堆積、侵食、河川流路、氷床荷重などは完全には反映していません。",
  "海峡や浅海域の細部は、使用データの解像度によって結果が変わります。航海・防災・測量・土地判断には使用できません。",
];

export default function App() {
  const initialState = useMemo(() => decodeUrlState(window.location.search, POINT_IDS), []);
  const [state, setState] = useState<UrlState>(initialState);
  const [panelOpen, setPanelOpen] = useState(
    () => window.matchMedia("(min-width: 641px)").matches,
  );
  const [noticeOpen, setNoticeOpen] = useState(false);
  const selectedPoint = INTERPRETATION_POINTS.find(
    (point) => point.id === state.selectedPointId,
  );

  useEffect(() => {
    const next = `${window.location.pathname}${encodeUrlState(state)}`;
    window.history.replaceState(null, "", next);
  }, [state]);

  const updateSeaLevel = (level: SeaLevel) =>
    setState((current) => ({ ...current, seaLevel: level }));

  const selectPoint = (point: InterpretationPoint) =>
    setState((current) => ({ ...current, selectedPointId: point.id }));

  return (
    <main className="app">
      <MapView
        seaLevel={state.seaLevel}
        layers={state.layers}
        initialCamera={initialState.camera}
        selectedPointId={state.selectedPointId}
        onCameraChange={(camera) => setState((current) => withCamera(current, camera))}
        onPointSelect={selectPoint}
      />

      <header className="brand">
        <p className="brand__eyebrow">ICE AGE MAP</p>
        <p className="brand__preview">Phase 2 Preview · 概算モデル</p>
        <h1>約20,000年前の地形を想像する</h1>
        <p>現在の陸上・海底地形と推定海面から生成した概算モデル</p>
      </header>

      <section className={`controls ${panelOpen ? "controls--open" : ""}`}>
        <button
          type="button"
          className="controls__toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? "操作を閉じる" : "レイヤーと凡例"}
        </button>
        {panelOpen && (
          <div className="controls__body">
            <div className="preset">
              <span>プリセット</span>
              <strong>約20,000年前</strong>
              <small>代表海面 −120m</small>
            </div>
            <fieldset>
              <legend>表示レイヤー</legend>
              {LAYER_IDS.map((layer) => (
                <label key={layer}>
                  <input
                    type="checkbox"
                    checked={state.layers[layer]}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        layers: setLayerVisibility(
                          current.layers,
                          layer,
                          event.target.checked,
                        ),
                      }))
                    }
                  />
                  <span>{LAYER_LABELS[layer]}</span>
                </label>
              ))}
            </fieldset>
            <div className="legend" aria-label="凡例">
              <span>
                <i className="legend__swatch legend__swatch--current" />
                現在陸域
              </span>
              <span>
                <i className="legend__swatch legend__swatch--shelf" />
                新たに露出する陸域（MODEL）
              </span>
              <span>
                <i className="legend__line legend__line--current" />
                現在海岸線（DATA）
              </span>
              <span>
                <i className="legend__line legend__line--model" />
                推定海岸線（MODEL）
              </span>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => setNoticeOpen(true)}
            >
              注意書き・データ出典
            </button>
          </div>
        )}
      </section>

      <section className="sea-control" aria-label="海面シミュレーション">
        <div>
          <span>
            {state.seaLevel === -120 ? "プリセット：約20,000年前" : "海面シミュレーション"}
          </span>
          <output htmlFor="sea-level">
            {state.seaLevel < 0 ? "−" : "+"}
            {Math.abs(state.seaLevel)}m
          </output>
          {state.seaLevel !== -120 && <small>時代プリセットから変更されています</small>}
        </div>
        <input
          id="sea-level"
          data-testid="sea-level"
          type="range"
          min="-140"
          max="-80"
          step="5"
          value={state.seaLevel}
          aria-label="推定海面"
          onChange={(event) => updateSeaLevel(Number(event.target.value) as SeaLevel)}
        />
        <div className="sea-control__range" aria-hidden="true">
          <span>−140m</span>
          <span>−80m</span>
        </div>
      </section>

      <button type="button" className="notice-access" onClick={() => setNoticeOpen(true)}>
        この地図について
      </button>

      <div className="credits">
        DATA: GEBCO_2026 / Natural Earth · MODEL: 4近傍外洋連結判定
      </div>

      {selectedPoint && (
        <aside className="info-sheet" aria-label={`${selectedPoint.name}の解説`}>
          <button
            type="button"
            className="info-sheet__close"
            aria-label="解説を閉じる"
            onClick={() => setState((current) => ({ ...current, selectedPointId: null }))}
          >
            ×
          </button>
          <p className="info-sheet__category">
            {selectedPoint.category === "uncertainty" ? "不確実性ポイント" : "解説ポイント"}
          </p>
          <h2>{selectedPoint.name}</h2>
          <InfoBlock label="DATA" text={selectedPoint.dataText} />
          <InfoBlock label="MODEL" text={selectedPoint.modelText} />
          <InfoBlock label="STORY" text={selectedPoint.storyText} />
          {selectedPoint.category === "uncertainty" && (
            <p className="uncertainty-note">{UNCERTAINTY_NOTICE}</p>
          )}
          <dl className="confidence">
            <div>
              <dt>概略地形</dt>
              <dd>{CONFIDENCE_LABELS[selectedPoint.confidence]}</dd>
            </div>
            <div>
              <dt>細部形状</dt>
              <dd>{CONFIDENCE_LABELS[selectedPoint.detailConfidence]}</dd>
            </div>
          </dl>
          <details>
            <summary>出典</summary>
            <ul>
              {selectedPoint.sources.map((source) => (
                <li key={source.label}>
                  <span>{source.classification}</span>{" "}
                  <a href={source.url}>{source.label}</a>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      )}

      {noticeOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="notice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-title"
          >
            <button
              type="button"
              className="info-sheet__close"
              aria-label="注意書きを閉じる"
              onClick={() => setNoticeOpen(false)}
            >
              ×
            </button>
            <p className="brand__eyebrow">MODEL NOTICE</p>
            <h2 id="notice-title">この地図について</h2>
            {DISCLAIMER.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <h3>データとクレジット</h3>
            <p>
              GEBCO Bathymetric Compilation Group 2026 (2026), The GEBCO_2026 Grid. Natural
              Earth 1:10m Coastline, Minor Islands, Rivers, Populated Places.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function InfoBlock({ label, text }: { label: "DATA" | "MODEL" | "STORY"; text: string }) {
  return (
    <section className={`info-block info-block--${label.toLowerCase()}`}>
      <h3>{label}</h3>
      <p>{text}</p>
    </section>
  );
}
