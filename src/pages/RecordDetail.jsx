import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import AppBar from '../components/AppBar';
import Loading from '../components/Loading';
import { db } from '../firebase';
import { photoUrl, STATUS, updateInspectionStatus } from '../lib/inspections';
import { formatDateTime } from '../lib/format';

export default function RecordDetail() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'inspections', id));
        if (!snap.exists()) {
          setError('搵唔到該筆紀錄');
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        if (cancelled) return;
        setRecord(data);
        setStatus(data.status);
        setLoading(false);
        const url = await photoUrl(data.photoPath);
        if (!cancelled) setSrc(url ?? '');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('讀取失敗：' + err.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleUpdate() {
    if (saving || !status || status === record.status) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateInspectionStatus(id, status);
      setRecord((prev) => ({ ...prev, status }));
      setMessage(`狀態已更新為「${status}」`);
    } catch (err) {
      console.error(err);
      setError('更新失敗：' + (err.code === 'permission-denied' ? '只有管理員可以改狀態' : err.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="載入紀錄…" />;

  return (
    <>
      <AppBar title="違規紀錄詳情" backTo="/admin" />
      <main className="page">
        {error ? <p className="alert alert-error">{error}</p> : null}
        {!record ? (
          <p className="muted">冇資料。</p>
        ) : (
          <>
            <div className="page-head">
              <h2>
                {record.floor} 後樓梯
                <span className={`tag tag-status-${mapKey(record.status)}`}>{record.status}</span>
              </h2>
              <p className="muted">上傳時間：{formatDateTime(record.createdAt)}</p>
            </div>

            <div className="detail-grid">
              <section className="card">
                <h3>AI 偵測相片</h3>
                {src ? (
                  <img className="detail-photo" src={src} alt={`${record.floor} 違規相片`} />
                ) : (
                  <div className="detail-photo placeholder">示範資料未附相片</div>
                )}
                <p className="muted small">
                  AI 引擎：{record.aiEngine || '—'} · 信心：{Math.round((record.aiConfidence ?? 0) * 100)}%
                </p>
              </section>

              <section className="card">
                <h3>處理狀態</h3>
                <div className="status-options">
                  {[STATUS.pending, STATUS.noticed, STATUS.closed].map((option) => (
                    <label key={option} className={`status-option ${status === option ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="status"
                        value={option}
                        checked={status === option}
                        onChange={() => setStatus(option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>

                <div className="row gap">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUpdate}
                    disabled={saving || status === record.status}
                  >
                    {saving ? '更新中…' : '更新狀態'}
                  </button>
                  <Link className="btn btn-cyan" to={`/admin/records/${id}/notice`}>
                    生成紙本通知
                  </Link>
                </div>

                {message ? <p className="alert alert-ok">{message}</p> : null}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function mapKey(status) {
  if (status === STATUS.closed) return 'closed';
  if (status === STATUS.noticed) return 'noticed';
  return 'pending';
}
