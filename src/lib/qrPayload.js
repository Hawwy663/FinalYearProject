/**
 * QR payload：`FYP1|<zoneId>|<seq>|<action>|<nextZone>|<crc8>`
 *
 * 為何唔用 URL：payload 越短，樓梯弱光下 QRCodeDetector 解碼率越高。
 * 40 字元以內實測穩定；帶 CRC8 可以擋讀錯一個字元就飛錯方向。
 *
 * 呢個檔案嘅算法必須同 `tools/drone/qr_payload.py` 完全一致。
 */

const VERSION = 'FYP1';
const ACTIONS = ['HOLD', 'TURN90', 'LAND', 'NONE'];
const ZONE_RE = /^[A-Z0-9]{4,12}$/;

/** CRC-8/ATM（poly 0x07），回傳兩位大寫 hex。 */
export function crc8(text) {
  let crc = 0;
  for (const ch of text) {
    crc ^= ch.charCodeAt(0) & 0xff;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(2, '0');
}

export function encodePayload({ zoneId, seq, action, nextZone = '' }) {
  if (!ZONE_RE.test(zoneId)) throw new Error(`zoneId 格式不正確: ${zoneId}`);
  if (!ACTIONS.includes(action)) throw new Error(`action 不正確: ${action}`);
  if (nextZone && !ZONE_RE.test(nextZone)) throw new Error(`nextZone 格式不正確: ${nextZone}`);

  const body = [VERSION, zoneId, String(seq).padStart(2, '0'), action, nextZone].join('|');
  return `${body}|${crc8(body)}`;
}

export function decodePayload(raw) {
  const parts = String(raw ?? '').trim().split('|');
  if (parts.length !== 6) throw new Error('payload 欄位數不正確');

  const [version, zoneId, seq, action, nextZone, checksum] = parts;
  if (version !== VERSION) throw new Error(`version 不支援: ${version}`);

  const body = parts.slice(0, 5).join('|');
  if (crc8(body) !== checksum.toUpperCase()) throw new Error('checksum 不正確');
  if (!ZONE_RE.test(zoneId)) throw new Error(`zoneId 格式不正確: ${zoneId}`);
  if (!ACTIONS.includes(action)) throw new Error(`action 不正確: ${action}`);

  return { zoneId, seq: Number(seq), action, nextZone };
}

export { ACTIONS, VERSION };
