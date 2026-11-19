/**
 * DeepSeek 路線生成（Callable Function）
 *
 * 為何唔可以由網頁直接 call DeepSeek：
 *   1. API key 會 expose 在 bundle 內，任何人 F12 就抄到
 *   2. api.deepseek.com 唔允許 browser CORS
 * 所以 key 只放在 Google Secret Manager，由 Cloud Function 代為呼叫。
 *
 * 輸入：{ prompt: string, apply?: boolean }
 * 輸出：{ summary, steps: [{ zoneId, markerId, seq, floor, label, action, nextZone, move }] }
 *
 * apply=true 時會用 Admin SDK 寫入 zones（客戶端 rules 唔准寫）。
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const DEEPSEEK_API_KEY = defineSecret('DEEPSEEK_API_KEY');

const ACTIONS = ['HOLD', 'TURN90', 'LAND', 'NONE'];
const MODEL = 'deepseek-flash';
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `你係樓梯間無人機巡邏系統的路線規劃器。
使用者會用自然語言描述巡查路線，你要輸出嚴格 JSON（不要 markdown、不要解釋）。

JSON 格式：
{
  "summary": "一句話說明路線",
  "steps": [
    {
      "zoneId": "B1F01L1",
      "markerId": 0,
      "seq": 1,
      "floor": "1樓",
      "label": "一樓平台 1",
      "action": "HOLD",
      "nextZone": "B1F01L2",
      "move": { "forward": 120, "right": 0, "up": 80 }
    }
  ]
}

硬性規則：
- zoneId 只可以大寫英文字母或數字，長度 4–12（例：B1F01L1）
- markerId 必須 0–49 之間、且不重複（ArUco DICT_4X4_50）
- seq 由 1 開始連續遞增
- action 只可以係 "HOLD" / "TURN90" / "LAND" / "NONE"
- nextZone 必須係清單內另一個 zoneId；最後一站用 ""
- move 單位係厘米，forward/right/up 各自 -300 到 300 的整數（up 正值 = 上升）
- 最多 8 站；最後一站 action 用 "LAND"
- 樓層用 "1樓"/"2樓"/"3樓" 這種寫法

如果使用者描述唔清楚，用合理預設（一層 2 個平台、每站前進 120cm、上樓 80cm）。`;

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('steps 必須係非空陣列');
  if (steps.length > 8) throw new Error('最多 8 站');

  const seenZones = new Set();
  const seenMarkers = new Set();

  const clean = steps.map((step, index) => {
    const zoneId = String(step.zoneId || '').toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(zoneId)) throw new Error(`第 ${index + 1} 站 zoneId 格式不正確: ${step.zoneId}`);
    if (seenZones.has(zoneId)) throw new Error(`zoneId 重複: ${zoneId}`);
    seenZones.add(zoneId);

    const markerId = Number(step.markerId);
    if (!Number.isInteger(markerId) || markerId < 0 || markerId > 49) {
      throw new Error(`第 ${index + 1} 站 markerId 必須 0–49`);
    }
    if (seenMarkers.has(markerId)) throw new Error(`markerId 重複: ${markerId}`);
    seenMarkers.add(markerId);

    const action = String(step.action || 'HOLD').toUpperCase();
    if (!ACTIONS.includes(action)) throw new Error(`action 不正確: ${step.action}`);

    const nextZone = String(step.nextZone || '').toUpperCase();
    const move = step.move || {};
    const clamp = (value) => Math.max(-300, Math.min(300, Math.round(Number(value) || 0)));

    return {
      zoneId,
      markerId,
      seq: index + 1,
      floor: String(step.floor || `第${index + 1}站`).slice(0, 20),
      label: String(step.label || `巡查點 ${index + 1}`).slice(0, 40),
      action,
      nextZone,
      move: { forward: clamp(move.forward), right: clamp(move.right), up: clamp(move.up) },
    };
  });

  // nextZone 必須指向清單內其中一個 zone，唔可以指去唔存在的點
  for (const step of clean) {
    if (step.nextZone && !seenZones.has(step.nextZone)) {
      throw new Error(`${step.zoneId} 的 nextZone 指向不存在的 ${step.nextZone}`);
    }
  }
  if (clean[clean.length - 1].nextZone) throw new Error('最後一站 nextZone 必須為空');
  return clean;
}

async function callDeepSeek(apiKey, prompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 冇回傳內容');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('DeepSeek 回傳唔係合法 JSON');
  }
  return { parsed, usage: data.usage || null };
}

exports.generateRoute = onCall(
  {
    region: 'asia-east1',
    secrets: [DEEPSEEK_API_KEY],
    cors: true,
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (request) => {
    // 只准管理員
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', '請先登入');

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists || userSnap.data().role !== 'admin') {
      throw new HttpsError('permission-denied', '只有管理員可以生成路線');
    }

    const prompt = String(request.data?.prompt || '').trim();
    if (prompt.length < 4) throw new HttpsError('invalid-argument', '請描述巡查路線（至少 4 個字）');
    if (prompt.length > 1000) throw new HttpsError('invalid-argument', '描述太長（上限 1000 字）');

    let parsed;
    let usage = null;
    try {
      const result = await callDeepSeek(DEEPSEEK_API_KEY.value(), prompt);
      parsed = result.parsed;
      usage = result.usage;
    } catch (err) {
      console.error('DeepSeek 呼叫失敗', err);
      throw new HttpsError('internal', `AI 生成失敗：${err.message}`);
    }

    let steps;
    try {
      steps = validateSteps(parsed.steps);
    } catch (err) {
      console.error('AI 輸出唔合法', parsed, err);
      throw new HttpsError('internal', `AI 輸出格式有問題：${err.message}`);
    }

    const summary = String(parsed.summary || '').slice(0, 200);

    if (request.data?.apply === true) {
      const batch = db.batch();
      for (const step of steps) {
        const { zoneId, ...rest } = step;
        batch.set(
          db.collection('zones').doc(zoneId),
          { ...rest, updatedAt: new Date(), source: 'deepseek' },
          { merge: true },
        );
      }
      batch.set(
        db.collection('routeLogs').doc(),
        {
          prompt,
          summary,
          steps,
          model: MODEL,
          usage,
          createdBy: uid,
          createdAt: new Date(),
        },
        { merge: true },
      );
      await batch.commit();
    }

    return { summary, model: MODEL, usage, steps };
  },
);
