import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';

export const STATUS = {
  pending: '待處理',
  noticed: '已通知',
  closed: '已結案',
};

/** 即時監聽最新巡查紀錄（最多 100 筆，新到舊）。 */
export function listenInspections(onData, onError) {
  const q = query(collection(db, 'inspections'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err),
  );
}

/** 上傳照片到 Storage，回傳 storage 路徑。 */
export async function uploadInspectionPhoto(inspectionKey, blob) {
  const path = `inspections/${inspectionKey}/photo-${Date.now()}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return path;
}

export function photoUrl(path) {
  return path ? getDownloadURL(ref(storage, path)).catch(() => null) : Promise.resolve(null);
}

/** 新增一筆巡查紀錄。 */
export async function createInspection({ floor, photoPath, aiDetected, aiConfidence, aiEngine, note }) {
  const payload = {
    floor,
    photoPath: photoPath ?? '',
    aiDetected: Boolean(aiDetected),
    aiConfidence: Number(aiConfidence ?? 0),
    aiEngine: aiEngine ?? 'unknown',
    note: note ?? '',
    status: STATUS.pending,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.uid,
  };
  const refDoc = await addDoc(collection(db, 'inspections'), payload);
  return refDoc.id;
}

/** 更新處理狀態（只有 admin 有權限，rules 會擋）。 */
export async function updateInspectionStatus(inspectionId, status) {
  await updateDoc(doc(db, 'inspections', inspectionId), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}

/** 登記紙本通知。 */
export async function createNotice({ inspectionId, floor, deadline }) {
  const refDoc = await addDoc(collection(db, 'notices'), {
    inspectionId,
    floor,
    deadline,
    printedAt: serverTimestamp(),
    createdBy: auth.currentUser.uid,
  });
  return refDoc.id;
}
