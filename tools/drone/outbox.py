"""離線 outbox：連住 Tello WiFi 時冇互聯網，寫唔到 Firestore 就暫存本機，落地後 sync。"""

import json
import os
from datetime import datetime, timezone

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outbox.jsonl")


def enqueue(record: dict) -> None:
    payload = {**record, "queuedAt": datetime.now(timezone.utc).isoformat()}
    with open(PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def pending() -> int:
    if not os.path.exists(PATH):
        return 0
    with open(PATH, encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())


def sync(db) -> int:
    """把 outbox 內所有紀錄送到 Firestore；成功一筆刪一筆。回傳成功數。"""
    if not os.path.exists(PATH):
        return 0

    sent = 0
    keep = []
    with open(PATH, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            rec = json.loads(line)
            try:
                run_id = rec.pop("runId")
                db.collection("runs").document(run_id).collection("steps").add(rec)
                sent += 1
            except Exception:
                keep.append(line)

    with open(PATH, "w", encoding="utf-8") as fh:
        fh.writelines(keep)
    return sent
