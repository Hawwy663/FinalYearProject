/**
 * 建立 6 個巡查點（3 層 × 2 平台）。
 *
 * 用法：
 *   1. Firebase console → 專案設定 → 服務帳戶 → 產生新的私密金鑰（JSON）
 *   2. PowerShell:
 *        $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccount.json"
 *        npm run seed:zones
 *
 * 為何要 Admin SDK：`zones` 在 firestore.rules 是 write:false，
 * 只有管理端可以建立路線，避免保安在 UI 誤改。
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error('請先設定 GOOGLE_APPLICATION_CREDENTIALS 指向 service account JSON');
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
  projectId: process.env.FIREBASE_PROJECT_ID || 'fyp-backstair',
});

const db = getFirestore();

const ZONES = [
  { id: 'B1F01L1', seq: 1, floor: '1樓', label: '一樓平台 1', action: 'HOLD', nextZone: 'B1F01L2', move: { forward: 120, right: 0, up: 0 } },
  { id: 'B1F01L2', seq: 2, floor: '1樓', label: '一樓平台 2', action: 'HOLD', nextZone: 'B1F02L1', move: { forward: 60, right: 0, up: 80 } },
  { id: 'B1F02L1', seq: 3, floor: '2樓', label: '二樓平台 1', action: 'HOLD', nextZone: 'B1F02L2', move: { forward: 120, right: 0, up: 0 } },
  { id: 'B1F02L2', seq: 4, floor: '2樓', label: '二樓平台 2', action: 'HOLD', nextZone: 'B1F03L1', move: { forward: 60, right: 0, up: 80 } },
  { id: 'B1F03L1', seq: 5, floor: '3樓', label: '三樓平台 1', action: 'HOLD', nextZone: 'B1F03L2', move: { forward: 120, right: 0, up: 0 } },
  { id: 'B1F03L2', seq: 6, floor: '3樓', label: '三樓平台 2', action: 'LAND', nextZone: '', move: { forward: 0, right: 0, up: 0 } },
];

for (const zone of ZONES) {
  const { id, ...data } = zone;
  await db.collection('zones').doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log('zone:', id, data.floor, data.label);
}

console.log(`完成，共 ${ZONES.length} 個巡查點`);
process.exit(0);
