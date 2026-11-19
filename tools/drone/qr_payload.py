"""Tello Talent 地面站 — QR payload 編解碼。

算法必須同 `src/lib/qrPayload.js` 完全一致；兩邊都有 golden test 互相對照：
    FYP1|B1F01L1|01|HOLD|B1F01L2|8F
"""

ACTIONS = {"HOLD", "TURN90", "LAND", "NONE"}
VERSION = "FYP1"


def crc8(text: str) -> str:
    """CRC-8/ATM（poly 0x07），回傳兩位大寫 hex。"""
    crc = 0
    for ch in text:
        crc ^= ord(ch) & 0xFF
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return f"{crc:02X}"


def encode_payload(zone_id: str, seq: int, action: str, next_zone: str = "") -> str:
    if not zone_id or not zone_id.isupper() or not zone_id.isalnum():
        raise ValueError(f"zoneId 格式不正確: {zone_id}")
    if action not in ACTIONS:
        raise ValueError(f"action 不正確: {action}")
    body = "|".join([VERSION, zone_id, f"{seq:02d}", action, next_zone])
    return f"{body}|{crc8(body)}"


def decode_payload(raw: str) -> dict:
    parts = (raw or "").strip().split("|")
    if len(parts) != 6:
        raise ValueError("payload 欄位數不正確")
    version, zone_id, seq, action, next_zone, checksum = parts
    if version != VERSION:
        raise ValueError(f"version 不支援: {version}")
    if crc8("|".join(parts[:5])) != checksum.upper():
        raise ValueError("checksum 不正確")
    if action not in ACTIONS:
        raise ValueError(f"action 不正確: {action}")
    return {"zoneId": zone_id, "seq": int(seq), "action": action, "nextZone": next_zone}


if __name__ == "__main__":
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    samples = [
        ("B1F01L1", 1, "HOLD", "B1F01L2", "FYP1|B1F01L1|01|HOLD|B1F01L2|8F"),
        ("B1F03L2", 3, "HOLD", "B1F04L1", "FYP1|B1F03L2|03|HOLD|B1F04L1|32"),
    ]
    for zone, seq, action, nxt, expected in samples:
        got = encode_payload(zone, seq, action, nxt)
        assert got == expected, f"{got} != {expected}"
        print("OK", got, "->", decode_payload(got))
