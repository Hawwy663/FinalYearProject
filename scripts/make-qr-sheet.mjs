/**
 * 產生可列印的 QR 貼紙：
 *   docs/qr-sheet.html  —— 6 張 A6 貼紙（3 層 × 2 平台），直接用瀏覽器列印
 *   docs/qr/<zoneId>.png —— 單張 PNG，方便貼上標籤機
 *
 * 執行：npm run qr:sheet
 * 之後用 Chrome 印成 PDF：
 *   chrome --headless=new --print-to-pdf=docs/qr-sheet.pdf --no-pdf-header-footer docs/qr-sheet.html
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { encodePayload } from '../src/lib/qrPayload.js';

const ZONES = [
  { zoneId: 'B1F01L1', seq: 1, floor: '1樓', label: '一樓平台 1', action: 'HOLD', nextZone: 'B1F01L2' },
  { zoneId: 'B1F01L2', seq: 2, floor: '1樓', label: '一樓平台 2', action: 'HOLD', nextZone: 'B1F02L1' },
  { zoneId: 'B1F02L1', seq: 3, floor: '2樓', label: '二樓平台 1', action: 'HOLD', nextZone: 'B1F02L2' },
  { zoneId: 'B1F02L2', seq: 4, floor: '2樓', label: '二樓平台 2', action: 'HOLD', nextZone: 'B1F03L1' },
  { zoneId: 'B1F03L1', seq: 5, floor: '3樓', label: '三樓平台 1', action: 'HOLD', nextZone: 'B1F03L2' },
  { zoneId: 'B1F03L2', seq: 6, floor: '3樓', label: '三樓平台 2', action: 'LAND', nextZone: '' },
];

const outDir = path.join(process.cwd(), 'docs');
const pngDir = path.join(outDir, 'qr');
mkdirSync(pngDir, { recursive: true });

const cells = [];
for (const zone of ZONES) {
  const payload = encodePayload(zone);
  const pngPath = path.join(pngDir, `${zone.zoneId}.png`);
  // margin 4（quiet zone）：貼紙要有白邊，機身傾斜少許仍然解得到
  await QRCode.toFile(pngPath, payload, { width: 900, margin: 4, errorCorrectionLevel: 'M' });
  const dataUrl = await QRCode.toDataURL(payload, { width: 900, margin: 4, errorCorrectionLevel: 'M' });
  cells.push({ ...zone, payload, dataUrl });
  console.log('qr:', zone.zoneId, payload);
}

const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8" />
<title>樓梯間 QR Code 貼紙</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Microsoft JhengHei", "Segoe UI", sans-serif; background: #fff; color: #111; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }
  .cell {
    border: 1px dashed #999; padding: 10mm 8mm; text-align: center;
    height: 148mm; page-break-inside: avoid; break-inside: avoid;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .cell img { width: 62mm; height: 62mm; }
  .floor { font-size: 22pt; font-weight: 800; margin-top: 4mm; letter-spacing: 1px; }
  .label { font-size: 12pt; }
  .meta { font-size: 9pt; color: #555; margin-top: 1mm; }
  .payload { font-size: 6.5pt; color: #888; font-family: Consolas, monospace; margin-top: 2mm; }
  @page { size: A4; margin: 6mm; }
  @media print { .cell { border: 1px solid #ccc; } }
</style>
</head>
<body>
  <div class="sheet">
${cells
  .map(
    (c) => `    <div class="cell">
      <img src="${c.dataUrl}" alt="${c.floor} ${c.label} QR Code" />
      <div class="floor">${c.floor}</div>
      <div class="label">${c.label}</div>
      <div class="meta">${c.zoneId} · 第 ${c.seq} 站 · ${c.action}</div>
      <div class="payload">${c.payload}</div>
    </div>`,
  )
  .join('\n')}
  </div>
</body>
</html>
`;

writeFileSync(path.join(outDir, 'qr-sheet.html'), html, 'utf8');
console.log('\n寫出 docs/qr-sheet.html（用瀏覽器列印，或 chrome --print-to-pdf）');
