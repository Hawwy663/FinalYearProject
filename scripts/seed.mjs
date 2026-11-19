/**
 * 示範資料種子：用 admin 帳號（受 Firestore rules 約束）寫入數筆巡查紀錄。
 * 執行：npm run seed
 *
 * 需要 .env 內已設好 VITE_FIREBASE_* 變數。
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

const SEED = [
  { floor: '1樓', aiDetected: true, aiConfidence: 0.86, status: '待處理', daysAgo: 0 },
  { floor: '2樓', aiDetected: false, aiConfidence: 0.12, status: '待處理', daysAgo: 0 },
  { floor: '3樓', aiDetected: true, aiConfidence: 0.71, status: '已結案', daysAgo: 1 },
];

async function main() {
  const email = process.env.SEED_EMAIL || 'admin@fyp.local';
  const password = process.env.SEED_PASSWORD || 'Admin1234!';

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log('登入成功:', email, uid);

  for (const item of SEED) {
    const ref = await addDoc(collection(db, 'inspections'), {
      floor: item.floor,
      photoPath: '',
      aiDetected: item.aiDetected,
      aiConfidence: item.aiConfidence,
      aiEngine: 'seed',
      note: '示範資料',
      status: '待處理',
      createdAt: serverTimestamp(),
      createdBy: uid,
    });

    if (item.status !== '待處理') {
      const { updateDoc, doc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'inspections', ref.id), {
        status: item.status,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    console.log(`已寫入 ${item.floor} (${ref.id}) 狀態=${item.status} 標記=${randomUUID().slice(0, 6)}`);
  }

  console.log('種子資料完成');
  process.exit(0);
}

main().catch((err) => {
  console.error('種子失敗:', err);
  process.exit(1);
});
