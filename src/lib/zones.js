import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

/** 即時監聽所有巡查點（依 seq 排序）。 */
export function listenZones(onData, onError) {
  return onSnapshot(
    query(collection(db, 'zones'), orderBy('seq', 'asc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err),
  );
}

export async function listZones() {
  const snap = await getDocs(query(collection(db, 'zones'), orderBy('seq', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getZone(zoneId) {
  const snap = await getDoc(doc(db, 'zones', zoneId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
