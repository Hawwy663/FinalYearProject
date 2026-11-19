import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import AppBar from '../components/AppBar';
import Loading from '../components/Loading';
import { db } from '../firebase';
import { createNotice, STATUS, updateInspectionStatus } from '../lib/inspections';
import { dateInputValue, formatChineseDate } from '../lib/format';

export default function PrintNotice() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [deadline, setDeadline] = useState(dateInputValue(7));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [noticeId, setNoticeId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'inspections', id));
        if (!cancelled) {
          if (snap.exists()) setRecord({ id: snap.id, ...snap.data() });
          else setError('搵唔到該筆巡查紀錄');
          setLoading(false);
        }
      } catch (err) {
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

  async function handlePrint() {
    if (!record || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const newNoticeId = await createNotice({
        inspectionId: record.id,
        floor: record.floor,
        deadline,
      });
      setNoticeId(newNoticeId);

      if (record.status !== STATUS.noticed) {
        await updateInspectionStatus(record.id, STATUS.noticed);
        setRecord((prev) => ({ ...prev, status: STATUS.noticed }));
      }
      setMessage('通知已登記，正在開啟列印…');
      window.print();
    } catch (err) {
      console.error(err);
      setError('登記通知失敗：' + err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="準備通知單…" />;

  return (
    <>
      <div className="no-print">
        <AppBar title="通知單預覽" backTo={record ? `/admin/records/${id}` : '/admin'} />
      </div>

      <main className="page">
        <div className="card no-print">
          <div className="row gap wrap">
            <label className="field">
              <span>清理限期</span>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <div className="grow" />
            <button type="button" className="btn btn-cyan" onClick={handlePrint} disabled={busy || !record}>
              {busy ? '處理中…' : '🖨️ 確認列印'}
            </button>
          </div>
          {message ? <p className="alert alert-ok">{message}</p> : null}
          {error ? <p className="alert alert-error">{error}</p> : null}
          {noticeId ? <p className="muted small">通知編號：{noticeId}</p> : null}
        </div>

        <article className="notice-paper">
          <h1 className="notice-title">後樓梯雜物清理通知</h1>
          <p>致 貴住戶：</p>
          <p>
            本大廈管理處在進行日常無人機巡查時，於 <strong>{record?.floor ?? '＿＿＿'}</strong> 後樓梯發現堆放雜物，
            阻礙逃生通道。
          </p>
          <p>
            請於 <strong>{formatChineseDate(deadline)}</strong> 前將雜物清理完畢，以確保大廈消防安全。
          </p>
          <p>如限期過後仍未清理，管理處將保留追究權利，並交由相關政府部門處理。</p>
          <p className="notice-sign">XX大廈管理處 敬啟</p>
        </article>
      </main>
    </>
  );
}
