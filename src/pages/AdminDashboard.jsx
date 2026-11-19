import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppBar from '../components/AppBar';
import { listenInspections, photoUrl, STATUS } from '../lib/inspections';
import { formatDateTime, isToday } from '../lib/format';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: STATUS.pending },
  { key: 'noticed', label: STATUS.noticed },
  { key: 'closed', label: STATUS.closed },
];

export default function AdminDashboard() {
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [thumbs, setThumbs] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenInspections(
      (data) => {
        setRecords(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('讀取紀錄失敗：' + err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // 為列表中的照片取 URL（快取避免重複請求）
  useEffect(() => {
    const missing = records.filter((r) => r.photoPath && !(r.id in thumbs));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = {};
      for (const r of missing.slice(0, 20)) {
        next[r.id] = await photoUrl(r.photoPath);
      }
      if (!cancelled) setThumbs((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const stats = useMemo(() => {
    const today = records.filter((r) => isToday(r.createdAt));
    return {
      today: today.length,
      violations: records.filter((r) => r.aiDetected).length,
      pending: records.filter((r) => r.status === STATUS.pending).length,
    };
  }, [records]);

  const visible = useMemo(() => {
    if (filter === 'all') return records;
    const map = { pending: STATUS.pending, noticed: STATUS.noticed, closed: STATUS.closed };
    return records.filter((r) => r.status === map[filter]);
  }, [records, filter]);

  return (
    <>
      <AppBar title="後樓梯消防巡查管理系統" />
      <main className="page">
        <div className="page-head row space-between">
          <div>
            <h2>總覽</h2>
            <p className="muted">即時同步 Firestore · {records.length} 筆紀錄</p>
          </div>
          <Link to="/staff" className="btn btn-ghost">
            員工端
          </Link>
          <Link to="/admin/markers" className="btn btn-ghost">
            ArUco 貼紙
          </Link>
        </div>

        <section className="stats">
          <div className="stat">
            <span>今日上傳</span>
            <strong>{stats.today}</strong>
          </div>
          <div className="stat">
            <span>AI 發現違規</span>
            <strong className="danger">{stats.violations}</strong>
          </div>
          <div className="stat">
            <span>待處理</span>
            <strong className="warn">{stats.pending}</strong>
          </div>
        </section>

        <section className="card">
          <div className="row space-between wrap">
            <h3>巡查紀錄</h3>
            <div className="filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`chip-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="alert alert-error">{error}</p> : null}
          {loading ? <p className="muted">載入中…</p> : null}

          {!loading && visible.length === 0 ? (
            <p className="muted">暫時冇符合條件嘅紀錄。</p>
          ) : null}

          {visible.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>相片</th>
                    <th>樓層</th>
                    <th>AI 判定</th>
                    <th>狀態</th>
                    <th>上傳時間</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {thumbs[r.id] ? (
                          <img className="thumb" src={thumbs[r.id]} alt={`${r.floor} 巡查相片`} />
                        ) : (
                          <span className="thumb thumb-empty">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{r.floor}</strong>
                      </td>
                      <td>
                        {r.aiDetected ? (
                          <span className="tag tag-danger">發現雜物 {Math.round((r.aiConfidence ?? 0) * 100)}%</span>
                        ) : (
                          <span className="tag tag-ok">未發現</span>
                        )}
                      </td>
                      <td>
                        <span className={`tag tag-status-${statusKey(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="muted small">{formatDateTime(r.createdAt)}</td>
                      <td>
                        <Link to={`/admin/records/${r.id}`} className="btn btn-sm">
                          查看詳情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

function statusKey(status) {
  if (status === STATUS.closed) return 'closed';
  if (status === STATUS.noticed) return 'noticed';
  return 'pending';
}
