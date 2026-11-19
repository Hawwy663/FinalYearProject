import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePayload, decodePayload, crc8 } from '../src/lib/qrPayload.js';

test('encode → decode 來回一致', () => {
  const payload = { zoneId: 'B1F03L2', seq: 3, action: 'HOLD', nextZone: 'B1F04L1' };
  const raw = encodePayload(payload);
  assert.equal(raw.startsWith('FYP1|'), true);
  assert.deepEqual(decodePayload(raw), payload);
});

test('已知 payload 的 CRC 值固定', () => {
  // 同 tools/drone/qr_payload.py 對照用的黃金值
  assert.equal(
    encodePayload({ zoneId: 'B1F01L1', seq: 1, action: 'HOLD', nextZone: 'B1F01L2' }),
    'FYP1|B1F01L1|01|HOLD|B1F01L2|8F',
  );
  assert.equal(
    encodePayload({ zoneId: 'B1F03L2', seq: 3, action: 'HOLD', nextZone: 'B1F04L1' }),
    'FYP1|B1F03L2|03|HOLD|B1F04L1|32',
  );
});

test('CRC 錯就拒收', () => {
  const raw = encodePayload({ zoneId: 'B1F03L2', seq: 3, action: 'HOLD', nextZone: '' });
  const broken = raw.slice(0, -2) + '00';
  assert.throws(() => decodePayload(broken), /checksum/i);
});

test('版本唔對就拒收', () => {
  assert.throws(() => decodePayload('FYP9|B1F01L1|01|HOLD||00'), /version/i);
});

test('欄位數唔對就拒收', () => {
  assert.throws(() => decodePayload('FYP1|B1F01L1|01|HOLD'), /欄位數/i);
});

test('crc8 穩定', () => {
  assert.equal(crc8('FYP1|B1F03L2|03|HOLD|B1F04L1'), '32');
});
