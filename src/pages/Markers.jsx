import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AppBar from '../components/AppBar';
import { app, db } from '../firebase';

/**
 * ArUco 貼紙頁 + DeepSeek 路線生成。
 *
 * 貼紙由網頁即時畫（SVG），位元圖來自 `public/markers/dict-4x4-50.json`
 * （由 OpenCV 匯出，所以同無人機偵測的字典完全一致）。
 * 好處：AI 生成路線 → 套用 → 貼紙即刻更新，唔需要 service account、唔需要跑 Python。
 *
 * 無人機需要的 `markers.json`（markerId → zone + move）可以一鍵下載。
 */
const EXAMPLE = '一樓平台 1 同平台 2 都要巡查，跟住上二樓兩個平台，最後上三樓降落。每站前進 120cm，上樓 80cm。';
const QUIET_ZONE = 2;
const MARKER_SIZE_M = 0.08;

function useDict() {
  const [dict, setDict] = useState(null);
  useEffect(() => {
    fetch('/markers/dict-4x4-50.json')
      .then((res) => res.json())
      .then(setDict)
      .catch(() => setDict(null));
  }, []);
  return dict;
}

function MarkerSvg({ dict, markerId, label }) {
  const code = dict?.codes?.[markerId];
  if (!code) return <div className="qr-placeholder" />;

  const modules = dict.modules; // 6
  const total = modules + QUIET_ZONE * 2; // 10
  const cells = [];
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (code[row * modules + col] === '1') {
        cells.push(
          <rect
            key={`${row}-${col}`}
            x={col + QUIET_ZONE}
            y={row + QUIET_ZONE}
            width={1}
            height={1}
            fill="#000"
          />,
        );
      }
    }
  }

  return (
    <svg
      className="aruco-svg"
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={`${label} ArUco ID ${markerId}`}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#fff" />
      {cells}
    </svg>
  );
}

export default function Markers() {
  const dict = useDict();
  const [zones, setZones] = useState([]);
  const [zonesError, setZonesError] = useState('');

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [route, setRoute] = useState(null);
  const [aiError, setAiError] = useState('');
  const [notice, setNotice] = useState('');

  // 直接監聽 Firestore zones：AI 套用後貼紙即刻更新
  useEffect(() => {
    const q = query(collection(db, 'zones'), orderBy('seq', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setZones(snap.docs.map((d) => ({ zoneId: d.id, ...d.data() })));
        setZonesError('');
      },
      (err) => setZonesError('讀取巡查點失敗：' + err.message),
    );
  }, []);

  const sorted = useMemo(() => [...zones].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), [zones]);

  async function generate(apply = false) {
    setAiError('');
    setNotice('');
    apply ? setApplying(true) : setGenerating(true);
    try {
      const functions = getFunctions(app, 'asia-east1');
      const call = httpsCallable(functions, 'generateRoute', { timeout: 120000 });
      const result = await call({ prompt: prompt.trim(), apply });
      setRoute(result.data);
      if (apply) setNotice(`已套用 ${result.data.steps.length} 個巡查點，下面貼紙已即時更新。`);
    } catch (err) {
      console.error(err);
      setAiError(err.message || 'AI 生成失敗');
    } finally {
      setGenerating(false);
      setApplying(false);
    }
  }

  function downloadMarkersJson() {
    const payload = {
      dictionary: 'DICT_4X4_50',
      markerSizeM: MARKER_SIZE_M,
      quietZoneModules: QUIET_ZONE,
      zones: sorted.map((z) => ({
        zoneId: z.zoneId,
        markerId: z.markerId,
        seq: z.seq,
        floor: z.floor,
        label: z.label,
        action: z.action,
        nextZone: z.nextZone ?? '',
        move: z.move ?? { forward: 0, right: 0, up: 0 },
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'markers.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="no-print">
        <AppBar title="ArUco 貼紙" backTo="/admin" />
      </div>

      <main className="page">
        <div className="card no-print">
          <h3>用 AI 生成路線</h3>
          <p className="muted small">
            用一句話描述路線，deepseek-flash 會轉成「每個巡查點 / ArUco ID / 動作 / 位移」。
            撳「套用至系統」後，下面貼紙會即時用新路線畫出嚟。
          </p>
          <textarea
            className="ai-input"
            rows={3}
            value={prompt}
            placeholder={EXAMPLE}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="row gap wrap" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => generate(false)}
              disabled={generating || applying || prompt.trim().length < 4}
            >
              {generating ? '生成中…' : '🤖 生成路線'}
            </button>
            <button
              type="button"
              className="btn btn-cyan"
              onClick={() => generate(true)}
              disabled={generating || applying || prompt.trim().length < 4}
            >
              {applying ? '套用中…' : '套用至系統'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPrompt(EXAMPLE)}>
              填入範例
            </button>
          </div>

          {aiError ? <p className="alert alert-error">{aiError}</p> : null}
          {notice ? <p className="alert alert-ok">{notice}</p> : null}

          {route ? (
            <div style={{ marginTop: 14 }}>
              <p className="muted small">
                模型：{route.model} · {route.summary}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>zoneId</th>
                      <th>ArUco ID</th>
                      <th>樓層</th>
                      <th>動作</th>
                      <th>下一步</th>
                      <th>移動 (cm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {route.steps.map((s) => (
                      <tr key={s.zoneId}>
                        <td>{s.seq}</td>
                        <td>
                          <code>{s.zoneId}</code>
                        </td>
                        <td>{s.markerId}</td>
                        <td>{s.floor}</td>
                        <td>
                          <span className={`tag tag-status-${s.action === 'LAND' ? 'closed' : 'pending'}`}>
                            {s.action}
                          </span>
                        </td>
                        <td>{s.nextZone || '—'}</td>
                        <td className="muted small">
                          前 {s.move.forward} · 右 {s.move.right} · 上 {s.move.up}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card no-print">
          <div className="row space-between wrap">
            <div>
              <h3>樓梯間 ArUco 標記</h3>
              <p className="muted small">
                共 {sorted.length} 個巡查點（DICT_4X4_50 · 黑格 {MARKER_SIZE_M * 1000}mm）。
                撳掣直接列印，貼在平台牆身，建議高度 1.2–1.5m、正對鏡頭、避免反光。
              </p>
            </div>
            <div className="row gap wrap">
              <button type="button" className="btn btn-ghost" onClick={downloadMarkersJson} disabled={!sorted.length}>
                ⬇️ markers.json
              </button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!sorted.length}>
                🖨️ 全部列印
              </button>
            </div>
          </div>
          {zonesError ? <p className="alert alert-error">{zonesError}</p> : null}
          {!sorted.length && !zonesError ? <p className="muted">載入中…</p> : null}
        </div>

        <div className="qr-sheet">
          {sorted.map((z) => (
            <div key={z.zoneId} className="qr-cell">
              <MarkerSvg dict={dict} markerId={z.markerId} label={z.label || z.zoneId} />
              <div className="qr-floor">{z.floor}</div>
              <div className="qr-label">{z.label}</div>
              <div className="qr-id">
                ArUco ID {z.markerId} · {z.zoneId} · 第 {z.seq} 站
              </div>
              {z.move ? (
                <div className="qr-payload">
                  前 {z.move.forward}cm · 右 {z.move.right}cm · 上 {z.move.up}cm
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <p className="muted small no-print">
          把下載到的 <code>markers.json</code> 放入 <code>tools/drone/</code>，無人機就會用同一份路線。
          貼紙尺寸必須同 <code>markerSizeM</code>（{MARKER_SIZE_M}m）一致，否則距離估錯。
        </p>
      </main>
    </>
  );
}
