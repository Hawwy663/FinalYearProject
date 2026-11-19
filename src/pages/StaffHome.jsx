import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppBar from '../components/AppBar';
import { useAuth } from '../context/AuthContext';
import { createInspection, listenInspections, uploadInspectionPhoto } from '../lib/inspections';
import { runStubDetector, DETECTOR_IS_STUB } from '../lib/aiDetector';
import { compressImage } from '../lib/img';
import { formatDateTime, todayKey, toDate } from '../lib/format';

const FLOORS = ['1樓', '2樓', '3樓'];

export default function StaffHome() {
  const { role, user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [floor, setFloor] = useState('1樓');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [detection, setDetection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const unsub = listenInspections(setRecords, (err) => {
      console.error(err);
      setLoadError('讀取紀錄失敗：' + err.message);
    });
    return unsub;
  }, []);

  const todayRecords = useMemo(
    () => records.filter((r) => {
      const d = toDate(r.createdAt);
      return d && todayKey(d) === todayKey();
    }),
    [records],
  );

  const floorStatus = useMemo(() => {
    const map = {};
    for (const f of FLOORS) {
      const items = todayRecords.filter((r) => r.floor === f);
      map[f] = items.length ? { done: true, count: items.length } : { done: false, count: 0 };
    }
    return map;
  }, [todayRecords]);

  function resetForm() {
    setFile(null);
    setDetection(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const picked = event.target.files?.[0];
    setMessage('');
    setError('');
    if (!picked) return;

    if (!picked.type.startsWith('image/')) {
      setError('請選擇圖片檔案');
      return;
    }
    if (picked.size > 15 * 1024 * 1024) {
      setError('圖片太大（上限 15MB）');
      return;
    }

    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setDetection(null);

    try {
      const blob = await compressImage(picked);
      const result = await runStubDetector(blob);
      setDetection(result);
    } catch (err) {
      console.error(err);
      setError('圖片處理失敗：' + err.message);
    }
  }

  async function handleSubmit() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const blob = await compressImage(file);
      const key = crypto.randomUUID();
      const photoPath = await uploadInspectionPhoto(key, blob);
      const result = detection ?? (await runStubDetector(blob));

      await createInspection({
        floor,
        photoPath,
        aiDetected: result.aiDetected,
        aiConfidence: result.aiConfidence,
        aiEngine: result.aiEngine,
      });

      setMessage(`已上傳 ${floor} 巡查記錄${result.aiDetected ? '（AI 判定有雜物）' : '（AI 未發現雜物）'}`);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('上傳失敗：' + (err.code === 'storage/unauthorized' ? '冇 Storage 權限' : err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar title="巡查" />
      <main className="page">
        <div className="page-head">
          <h2>今日巡查進度</h2>
          <p className="muted">{todayKey()} · 已登入 {user?.email}</p>
        </div>

        <section className="floor-grid">
          {FLOORS.map((f) => (
            <div key={f} className={`floor-card ${floorStatus[f].done ? 'done' : ''}`}>
              <div className="floor-name">{f}</div>
              <div className={`floor-status ${floorStatus[f].done ? 'ok' : 'todo'}`}>
                {floorStatus[f].done ? `已巡查 ${floorStatus[f].count} 次` : '未巡查'}
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <h3>上傳巡查記錄</h3>
          <p className="muted small">
            AI 偵測目前在瀏覽器跑 stub（未接駁 <code>.pt</code> 模型），結果只用於流程示範。
          </p>

          <div className="row gap">
            <label className="field">
              <span>樓層</span>
              <select value={floor} onChange={(e) => setFloor(e.target.value)}>
                {FLOORS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>

            <label className="field grow">
              <span>現場照片</span>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
            </label>
          </div>

          {previewUrl ? (
            <div className="preview">
              <img src={previewUrl} alt="巡查相片預覽" />
              <div className="preview-meta">
                <p>
                  <strong>AI 判定：</strong>
                  {detection
                    ? detection.aiDetected
                      ? `發現雜物（信心 ${detection.aiConfidence}）`
                      : `未發現雜物（信心 ${detection.aiConfidence}）`
                    : '分析中…'}
                </p>
                {DETECTOR_IS_STUB && detection ? <p className="muted small">引擎：{detection.aiEngine}</p> : null}
                <div className="row gap">
                  <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy || !detection}>
                    {busy ? '上傳中…' : '確認上傳'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={busy}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {message ? <p className="alert alert-ok">{message}</p> : null}
          {error ? <p className="alert alert-error">{error}</p> : null}
          {loadError ? <p className="alert alert-error">{loadError}</p> : null}
        </section>

        <section className="card">
          <h3>無人機控制</h3>
          <p className="muted small">未接駁無人機，以下按鈕暫時停用。</p>
          <div className="drone-buttons">
            {['開始巡查', '暫停', '繼續'].map((label) => (
              <button key={label} type="button" className="btn" disabled title="未接駁無人機">
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>今日已上傳</h3>
          {todayRecords.length === 0 ? (
            <p className="muted">今日仲未有記錄。</p>
          ) : (
            <ul className="plain-list">
              {todayRecords.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <span className="chip">{r.floor}</span>
                  <span>{formatDateTime(r.createdAt)}</span>
                  <span className={r.aiDetected ? 'tag tag-danger' : 'tag tag-ok'}>
                    {r.aiDetected ? 'AI：有雜物' : 'AI：無雜物'}
                  </span>
                  <span className="muted small">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {role === 'admin' ? (
          <p className="muted small">
            你係管理員，可以<Link to="/admin"> 去後台總覽</Link>。
          </p>
        ) : null}
      </main>
    </>
  );
}
