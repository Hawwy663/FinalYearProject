import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import AppBar from '../components/AppBar';
import { listenZones } from '../lib/zones';
import { encodePayload } from '../lib/qrPayload';

/**
 * QR Code 產生／列印頁。
 *
 * 設計原則（會議要求）：保安只需要「列印」，唔需要輸入任何文字或查詢。
 * 所有 zone 由系統預先建立，呢一頁只負責畫出 QR 同列印樣式。
 */
export default function QrPrint() {
  const [zones, setZones] = useState([]);
  const [images, setImages] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return listenZones(
      (data) => {
        setZones(data);
        setLoading(false);
      },
      (err) => {
        setError('讀取巡查點失敗：' + err.message);
        setLoading(false);
      },
    );
  }, []);

  const payloads = useMemo(() => {
    const map = {};
    for (const z of zones) {
      try {
        map[z.id] = encodePayload({
          zoneId: z.id,
          seq: z.seq,
          action: z.action,
          nextZone: z.nextZone ?? '',
        });
      } catch (err) {
        map[z.id] = `ERROR: ${err.message}`;
      }
    }
    return map;
  }, [zones]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const [id, raw] of Object.entries(payloads)) {
        if (raw.startsWith('ERROR')) continue;
        // errorCorrectionLevel M：樓梯光線一般；margin 4 保留白邊，輕微傾斜都解得到
        next[id] = await QRCode.toDataURL(raw, {
          margin: 4,
          width: 420,
          errorCorrectionLevel: 'M',
        });
      }
      if (!cancelled) setImages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [payloads]);

  return (
    <>
      <div className="no-print">
        <AppBar title="QR Code 列印" backTo="/admin" />
      </div>

      <main className="page">
        <div className="card no-print">
          <div className="row space-between wrap">
            <div>
              <h3>樓梯間 QR Code</h3>
              <p className="muted small">
                共 {zones.length} 個巡查點。撳掣直接列印，剪開貼在平台牆身（建議高度 1.2–1.5m，正對鏡頭）。
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!zones.length}>
              🖨️ 全部列印
            </button>
          </div>
          {loading ? <p className="muted">載入巡查點…</p> : null}
          {error ? <p className="alert alert-error">{error}</p> : null}
          {!loading && !error && zones.length === 0 ? (
            <p className="alert alert-error">未有巡查點，請先執行 `npm run seed:zones`。</p>
          ) : null}
        </div>

        <div className="qr-sheet">
          {zones.map((z) => (
            <div key={z.id} className="qr-cell">
              {images[z.id] ? (
                <img src={images[z.id]} alt={`${z.floor} ${z.label} QR Code`} />
              ) : (
                <div className="qr-placeholder" />
              )}
              <div className="qr-floor">{z.floor}</div>
              <div className="qr-label">{z.label}</div>
              <div className="qr-id">
                {z.id} · 第 {z.seq} 站 · {z.action}
              </div>
              <div className="qr-payload">{payloads[z.id]}</div>
            </div>
          ))}
        </div>

        <p className="muted small no-print">
          貼紙上印住 payload 字串（`FYP1|…|CRC`），方便你即場用電話核對；無人機掃到之後會用同一串字解碼。
        </p>
      </main>
    </>
  );
}
