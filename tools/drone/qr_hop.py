"""Tello Talent QR 導航地面站。

設計原則
--------
1. 預設唔飛：唔加 --fly 只會連線、解碼、影相、記錄。第一次測試一定用呢個模式。
2. 同一個 QR 唔會重複動作：避免機身晃動時原地打圈。
3. 連住 Tello WiFi 冇互聯網時，自動 fallback 去本機 outbox，落地後再 sync。
4. 電量低於門檻拒絕起飛。

用法
----
    python qr_hop.py                      # 地面測試（機放枱面，唔開槳）
    python qr_hop.py --camera 0           # 用 laptop webcam 代替 Tello 鏡頭
    python qr_hop.py --fly --takeoff      # 真飛（先讀 SAFETY.md，裝保護罩）
    python qr_hop.py --fly --seconds 90   # 限時 90 秒
"""

import argparse
import sys
import time

import cv2

import outbox
from qr_detect import decode_qr
from qr_payload import decode_payload

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT = "fyp-backstair"
BUCKET = "fyp-backstair.firebasestorage.app"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tello QR hop")
    parser.add_argument("--camera", type=int, default=None, help="用 webcam 代替 Tello 鏡頭（測試用）")
    parser.add_argument("--fly", action="store_true", help="真飛：依 QR 動作")
    parser.add_argument("--takeoff", action="store_true", help="配合 --fly：先起飛")
    parser.add_argument("--seconds", type=int, default=180, help="執行時間上限（秒）")
    parser.add_argument("--no-firestore", action="store_true", help="唔寫 Firestore（只本地 outbox）")
    parser.add_argument("--min-battery", type=int, default=50)
    return parser.parse_args()


def init_backend(use_firestore: bool):
    """回傳 (db, bucket)；任何失敗都降級成 None（改用 outbox）。"""
    if not use_firestore:
        return None, None
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, storage

        if not firebase_admin._apps:
            firebase_admin.initialize_app(
                credentials.ApplicationDefault(),
                {"projectId": PROJECT, "storageBucket": BUCKET},
            )
        return firestore.client(), storage.bucket()
    except Exception as err:
        print(f"[warn] Firestore 不可用，改用本機 outbox：{err}")
        return None, None


def record_step(db, run_id: str, step: dict) -> None:
    if db is not None:
        try:
            db.collection("runs").document(run_id).collection("steps").add(step)
            print("  → Firestore step 已寫入")
            return
        except Exception as err:
            print(f"  → Firestore 寫入失敗（{err}），入 outbox")
    outbox.enqueue({**step, "runId": run_id})


def upload_photo(bucket, run_id: str, zone_id: str, frame) -> str:
    if bucket is None:
        return ""
    path = f"runs/{run_id}/{zone_id}-{int(time.time())}.jpg"
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return ""
    try:
        bucket.blob(path).upload_from_string(buf.tobytes(), content_type="image/jpeg")
        print(f"  → 相片上傳 {path}")
        return path
    except Exception as err:
        print(f"  → 相片上傳失敗：{err}")
        return ""


class FrameSource:
    """統一介面：Tello 串流 或 webcam。"""

    def __init__(self, camera_index):
        self.tello = None
        self.battery = None
        self.flying = False
        self.cap = None

        if camera_index is not None:
            self.cap = cv2.VideoCapture(camera_index)
            if not self.cap.isOpened():
                raise SystemExit(f"開唔到 camera {camera_index}")
            print(f"[source] webcam {camera_index}")
        else:
            from djitellopy import Tello

            self.tello = Tello()
            self.tello.connect()
            self.battery = self.tello.get_battery()
            print(f"[source] Tello 已連線，電量 {self.battery}%")
            self.tello.streamon()
            time.sleep(1.0)

    def read(self):
        if self.tello is not None:
            frame = self.tello.get_frame_read().frame
            return frame if frame is not None else None
        ok, frame = self.cap.read()
        return frame if ok else None

    def height_cm(self) -> int:
        if self.tello is None:
            return 0
        try:
            return int(self.tello.get_height())
        except Exception:
            return 0

    def tof_cm(self) -> float:
        if self.tello is None:
            return 0.0
        try:
            return self.tello.get_distance_tof() / 10.0
        except Exception:
            return 0.0

    def takeoff(self) -> None:
        if self.tello is None:
            print("[dry] 冇真機，略過 takeoff")
            return
        self.tello.takeoff()
        self.flying = True
        time.sleep(1.0)

    def land(self) -> None:
        if self.tello is None or not self.flying:
            return
        try:
            self.tello.land()
        finally:
            self.flying = False

    def close(self) -> None:
        if self.tello is not None:
            try:
                if self.flying:
                    self.tello.land()
            except Exception:
                pass
            try:
                self.tello.streamoff()
                self.tello.end()
            except Exception:
                pass
        if self.cap is not None:
            self.cap.release()


def run(args: argparse.Namespace) -> int:
    if args.fly and args.camera is not None:
        print("--fly 同 --camera 唔可以一齊用")
        return 2

    db, bucket = init_backend(not args.no_firestore)
    run_id = f"run-{int(time.time())}"
    if db is not None:
        try:
            from firebase_admin import firestore as admin_firestore

            db.collection("runs").document(run_id).set(
                {
                    "startedAt": admin_firestore.SERVER_TIMESTAMP,
                    "mode": "fly" if args.fly else "dry-run",
                    "status": "running",
                }
            )
        except Exception as err:
            print(f"[warn] 建立 run 失敗：{err}；其餘紀錄會入 outbox")
    print(f"[run] {run_id}  mode={'fly' if args.fly else 'dry-run'}")

    source = FrameSource(args.camera)
    if args.fly and (source.battery is None or source.battery < args.min_battery):
        print(f"[abort] 電量 {source.battery}% < {args.min_battery}%，拒絕起飛")
        source.close()
        return 3

    seen = set()
    order = []
    deadline = time.time() + args.seconds
    frames = 0

    try:
        if args.fly and args.takeoff:
            source.takeoff()

        while time.time() < deadline:
            frame = source.read()
            if frame is None:
                time.sleep(0.05)
                continue
            frames += 1

            # 多角度解碼較貴，每 3 幀試一次（Tello 約 30fps）
            if frames % 3 != 0:
                continue

            data = decode_qr(frame)
            if not data:
                continue

            try:
                payload = decode_payload(data)
            except ValueError as err:
                print(f"[skip] QR 內容無效：{data!r} ({err})")
                continue

            if payload["zoneId"] in seen:
                continue
            seen.add(payload["zoneId"])
            order.append(payload["zoneId"])
            print(
                f"[QR ] {payload['zoneId']} seq={payload['seq']} "
                f"action={payload['action']} next={payload['nextZone'] or '-'}"
            )

            photo = upload_photo(bucket, run_id, payload["zoneId"], frame)
            record_step(
                db,
                run_id,
                {
                    "zoneId": payload["zoneId"],
                    "seq": payload["seq"],
                    "action": payload["action"],
                    "nextZone": payload["nextZone"],
                    "photoPath": photo,
                    "heightCm": source.height_cm(),
                    "tofCm": source.tof_cm(),
                },
            )

            action = payload["action"]
            if action == "LAND" and args.fly:
                print("  → LAND：降落")
                source.land()
                break
            if action == "TURN90" and args.fly:
                print("  → TURN90：右轉 90°")
                source.tello.rotate_clockwise(90)
    finally:
        source.close()
        if db is not None:
            try:
                db.collection("runs").document(run_id).update({"status": "finished"})
            except Exception:
                pass
        remaining = outbox.pending()
        print(f"[done] 掃到 {len(seen)} 個 QR：{order}")
        if remaining:
            print(f"[note] outbox 仲有 {remaining} 筆未同步，返回有網環境後跑 python sync_outbox.py")

    return 0


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
