import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AppBar from '../components/AppBar';
import { app } from '../firebase';

/**
 * ArUco 貼紙頁 + DeepSeek 路線生成。
 *
 * 流程：
 *   1. 管理員用自然語言描述路線（例：「一樓兩個平台，然後上二樓，最後三樓降落」）
 *   2. Cloud Function 呼叫 deepseek-flash，回傳嚴格 JSON（zone / markerId / action / move）
 *   3. 「套用」→ 寫入 Firestore `zones`
 *   4. 落本機執行 `python tools/drone/gen_markers.py --from-firestore` 重新產生貼紙
 *
 * 為何唔由瀏覽器直接 call DeepSeek：API key 會 expose；而且 DeepSeek 唔支援 browser CORS。
 * Key 只存在 Google Secret Manager，由 Cloud Function 代呼叫。
 */
const EXAMPLE = '一樓平台 1 同平台 2 都要巡查，跟住上二樓兩個平台，最後上三樓降落。每站前進 120cm，上樓 80cm。';

export default function Markers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [route, setRoute] = useState(null);
  const [aiError, setAiError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/markers/markers.json')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError('讀取 marker 資料失敗：' + err.message));
  }, []);

  const zones = data?.zones ?? [];

  async function generate(apply = false) {
    setAiError('');
    setNotice('');
    apply ? setApplying(true) : setGenerating(true);
    try {
      const functions = getFunctions(app, 'asia-east1');
      const call = httpsCallable(functions, 'generateRoute', { timeout: 120000 });
      const result = await call({ prompt: prompt.trim(), apply });
      setRoute(result.data);
      if (apply) {
        setNotice(
          `已套用 ${result.data.steps.length} 個巡查點。落本機執行：python tools/drone/gen_markers.py --from-firestore`,
        );
      }
    } catch (err) {
      console.error(err);
      setAiError(err.message || 'AI 生成失敗');
    } finally {
      setGenerating(false);
      setApplying(false);
    }
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
            用一句話描述巡查路線，deepseek-flash 會轉成「每個巡查點 / ArUco ID / 下一步動作」。
            套用之後重新產生貼紙即可。
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
                共 {zones.length} 個巡查點（{data?.dictionary ?? 'DICT_4X4_50'} · 黑格{' '}
                {data ? Math.round(data.markerSizeM * 1000) : 80}mm）。撳掣直接列印，貼在平台牆身，
                建議高度 1.2–1.5m、正對鏡頭、避免反光。
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!zones.length}>
              🖨️ 全部列印
            </button>
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          {!zones.length && !error ? <p className="muted">載入中…</p> : null}
        </div>

        <div className="qr-sheet">
          {zones.map((z) => (
            <div key={z.zoneId} className="qr-cell">
              <img src={`/markers/${z.zoneId}.png`} alt={`${z.floor} ${z.label} ArUco`} />
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
          改路線之後重新產生：`python tools/drone/gen_markers.py --from-firestore`。貼紙尺寸必須同
          markers.json 的 <code>markerSizeM</code> 一致，否則距離估錯。
        </p>
      </main>
    </>
  );
}
