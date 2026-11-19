"""離線同步：返回有互聯網的環境後，把 outbox.jsonl 推上 Firestore。

用法：
    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\serviceAccount.json"
    python sync_outbox.py
"""

import os
import sys

import outbox

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT = "fyp-backstair"


def main() -> int:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        print("請設定 GOOGLE_APPLICATION_CREDENTIALS")
        return 1

    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": PROJECT})

    before = outbox.pending()
    sent = outbox.sync(firestore.client())
    print(f"待同步 {before} 筆，成功 {sent} 筆，剩 {outbox.pending()} 筆")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
