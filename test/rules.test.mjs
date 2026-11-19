/**
 * Firestore rules 測試（Firebase emulator）
 * 執行：npm run test:rules
 *
 * 注意：未登入情境放在最後，避免 unauthenticatedContext 影響其他測試的 auth token。
 */
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-fyp';

let testEnv;

const ADMIN = { uid: 'admin-uid', email: 'admin@fyp.local' };
const STAFF = { uid: 'staff-uid', email: 'staff@fyp.local' };

function staffDb() {
  return testEnv.authenticatedContext(STAFF.uid, { email: STAFF.email }).firestore();
}

function adminDb() {
  return testEnv.authenticatedContext(ADMIN.uid, { email: ADMIN.email }).firestore();
}

function validInspection(uid) {
  return {
    floor: '1樓',
    photoPath: '',
    aiDetected: true,
    aiConfidence: 0.5,
    aiEngine: 'test',
    note: '',
    status: '待處理',
    createdAt: serverTimestamp(),
    createdBy: uid,
  };
}

function validNotice(uid) {
  return {
    inspectionId: 'abc',
    floor: '1樓',
    deadline: '2026-12-01',
    printedAt: serverTimestamp(),
    createdBy: uid,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN.uid), { role: 'admin', email: ADMIN.email, displayName: '管理員' });
    await setDoc(doc(db, 'users', STAFF.uid), { role: 'staff', email: STAFF.email, displayName: '巡查員' });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('inspections', () => {
  it('巡查員可以新增自己的巡查紀錄', async () => {
    await assertSucceeds(addDoc(collection(staffDb(), 'inspections'), validInspection(STAFF.uid)));
  });

  it('巡查員不能冒認別人新增', async () => {
    await assertFails(addDoc(collection(staffDb(), 'inspections'), validInspection(ADMIN.uid)));
  });

  it('新增時狀態必須係待處理', async () => {
    await assertFails(
      addDoc(collection(staffDb(), 'inspections'), { ...validInspection(STAFF.uid), status: '已結案' }),
    );
  });

  it('巡查員不能改狀態', async () => {
    const db = staffDb();
    const ref = await addDoc(collection(db, 'inspections'), validInspection(STAFF.uid));
    await assertFails(updateDoc(doc(db, 'inspections', ref.id), { status: '已結案' }));
  });

  it('管理員可以改狀態', async () => {
    const db = adminDb();
    const ref = await addDoc(collection(db, 'inspections'), validInspection(ADMIN.uid));
    await assertSucceeds(
      updateDoc(doc(db, 'inspections', ref.id), {
        status: '已結案',
        updatedAt: serverTimestamp(),
        updatedBy: ADMIN.uid,
      }),
    );
  });

  it('管理員不能改樓層（只准改狀態欄位）', async () => {
    const db = adminDb();
    const ref = await addDoc(collection(db, 'inspections'), validInspection(ADMIN.uid));
    await assertFails(updateDoc(doc(db, 'inspections', ref.id), { floor: '9樓' }));
  });
});

describe('notices', () => {
  it('巡查員不能建立通知', async () => {
    await assertFails(addDoc(collection(staffDb(), 'notices'), validNotice(STAFF.uid)));
  });

  it('管理員可以建立通知', async () => {
    await assertSucceeds(addDoc(collection(adminDb(), 'notices'), validNotice(ADMIN.uid)));
  });

  it('限期格式錯要拒絕', async () => {
    await assertFails(
      addDoc(collection(adminDb(), 'notices'), { ...validNotice(ADMIN.uid), deadline: '2026/12/01' }),
    );
  });
});

describe('users', () => {
  it('本人可以讀自己角色', async () => {
    await assertSucceeds(getDoc(doc(staffDb(), 'users', STAFF.uid)));
  });

  it('巡查員不能讀別人角色', async () => {
    await assertFails(getDoc(doc(staffDb(), 'users', ADMIN.uid)));
  });

  it('任何人都不能改角色文件', async () => {
    await assertFails(updateDoc(doc(adminDb(), 'users', ADMIN.uid), { role: 'staff' }));
  });
});

describe('未登入', () => {
  it('未登入不能讀取巡查紀錄', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'inspections', 'x')));
  });
});
