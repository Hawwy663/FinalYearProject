import { useEffect, useState } from 'react';
import AppBar from '../components/AppBar';

/**
 * ArUco 貼紙列印頁。
 *
 * 貼紙由 `tools/drone/gen_markers.py` 用 OpenCV 產生（同無人機同一套字典），
 * 所以網頁只需要展示 + 列印，唔需要自己編碼 marker —— 保證兩邊位元圖一致。
 */
export default function Markers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

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

  return (
    <>
      <div className="no-print">
        <AppBar title="ArUco 貼紙" backTo="/admin" />
      </div>

      <main className="page">
        <div className="card no-print">
          <div className="row space-between wrap">
            <div>
              <h3>樓梯間 ArUco 標記</h3>
              <p className="muted small">
                共 {zones.length} 個巡查點（{data?.dictionary ?? 'DICT_4X4_50'} · 黑格邊長{' '}
                {data ? Math.round(data.markerSizeM * 100) : 12}cm）。撳掣直接列印，貼在平台牆身，
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
            </div>
          ))}
        </div>

        <p className="muted small no-print">
          改路線之後重新產生：`python tools/drone/gen_markers.py`。貼紙尺寸必須同 markers.json 的{' '}
          <code>markerSizeM</code> 一致，否則距離估錯一半。
        </p>
      </main>
    </>
  );
}
