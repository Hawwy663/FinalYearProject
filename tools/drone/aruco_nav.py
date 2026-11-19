"""ArUco 導航地面站（Tello Talent）。

同 QR 版最大分別：ArUco 可以用相機內參算出 **6DoF pose**
（左右偏移、上下、距離 + 姿態），所以可以「對正個 marker 飛過去」，
而唔係只知「我掃到一個 ID」。

安全設計
--------
1. 預設乾跑（`--dry-run` 是預設值）：只偵測、算距離、影相、記錄，唔起槳。
2. `--approach` 才會閉環飛近；每次只飛一小步（≤30cm）再重新偵測。
3. `--fly` 只負責起飛／降落；冇 `--approach` 就只懸停影相。
4. 電量 < 50% 拒絕起飛；偵測不到 marker 時唔會盲飛。

用法
----
    python aruco_nav.py --camera 0                 # laptop 鏡頭測試
    python aruco_nav.py                            # 連 Tello，乾跑
    python aruco_nav.py --fly --takeoff --approach # 真飛並飛近 marker
"""

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

import outbox

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT = "fyp-backstair"
BUCKET = "fyp-backstair.firebasestorage.app"
MARKERS_JSON = Path(__file__).resolve().parents[2] / "public" / "markers" / "markers.json"

# Tello 相機：960x720、對角 FOV 82.6°，實測 fx≈900 已經夠用（要更準就做棋盤校正）
TELLO_W, TELLO_H = 960, 720
DEFAULT_FX = 900.0


def load_markers() -> dict:
    data = json.loads(MARKERS_JSON.read_text(encoding="utf-8"))
    return {
        "dictionary": data.get("dictionary", "DICT_4X4_50"),
        "markerSizeM": float(data.get("markerSizeM", 0.12)),
        "byId": {int(z["markerId"]): z for z in data["zones"]},
    }


def camera_matrix(width: int, height: int, fx: float) -> np.ndarray:
    return np.array([[fx, 0, width / 2], [0, fx, height / 2], [0, 0, 1]], dtype=np.float64)


def build_detector(dict_name: str):
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dict_name))
    params = cv2.aruco.DetectorParameters()
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    return cv2.aruco.ArucoDetector(dictionary, params)


def estimate_pose(corners, marker_size_m, k, dist):
    """回傳 (rvec, tvec)，兩者都是 3 元素 1-D 陣列；新舊 OpenCV 版本都支援。"""
    if hasattr(cv2.aruco, "estimatePoseSingleMarkers"):
        try:
            rvecs, tvecs, _ = cv2.aruco.estimatePoseSingleMarkers(corners, marker_size_m, k, dist)
            return np.asarray(rvecs[0]).reshape(3), np.asarray(tvecs[0]).reshape(3)
        except cv2.error:
            pass

    half = marker_size_m / 2.0
    object_points = np.array(
        [[-half, half, 0], [half, half, 0], [half, -half, 0], [-half, -half, 0]], dtype=np.float64
    )
    ok, rvec, tvec = cv2.solvePnP(object_points, np.asarray(corners).reshape(4, 2), k, dist)
    if not ok:
        return None, None
    return np.asarray(rvec).reshape(3), np.asarray(tvec).reshape(3)


def describe(tvec) -> str:
    x, y, z = float(tvec[0]), float(tvec[1]), float(tvec[2])
    side = "正中" if abs(x) < 0.05 else ("偏右" if x > 0 else "偏左")
    return f"距離 {z:0.2f}m · 橫向 {x:+.2f}m（{side}）· 垂直 {y:+.2f}m"


def plan_step(tvec, stop_distance: float) -> tuple[int, int]:
    """依 pose 決定下一步（厘米）：回傳 (前進, 右移)。

    OpenCV 相機座標：+x 向右、+y 向下、+z 向前。
    所以 marker 在畫面右邊（tvec.x > 0）就要向右橫移。
    """
    x, z = float(tvec[0]), float(tvec[2])
    forward = 0
    lateral = 0
    if z - stop_distance > 0.15:
        forward = int(min(30, max(10, round((z - stop_distance) * 100))))
    if abs(x) > 0.08:
        lateral = int(max(-25, min(25, round(x * 100))))
    return forward, lateral


def run(args: argparse.Namespace) -> int:
    markers = load_markers()
    if args.camera is not None and args.fly:
        print("--camera 同 --fly 唔可以一齊用")
        return 2

    db, bucket = init_backend(args)
    run_id = f"run-{int(time.time())}"
    print(f"[run] {run_id} dictionary={markers['dictionary']} marker={markers['markerSizeM']}m")

    source = FrameSource(args.camera)
    if args.fly and (source.battery is None or source.battery < args.min_battery):
        print(f"[abort] 電量 {source.battery}% < {args.min_battery}%")
        source.close()
        return 3

    width = TELLO_W if args.camera is None else int(source.width)
    height = TELLO_H if args.camera is None else int(source.height)
    k = camera_matrix(width, height, args.fx)
    dist = np.zeros((5, 1))
    detector = build_detector(markers["dictionary"])

    handled = set()
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
            if frames % 3 != 0:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            corners, ids, _ = detector.detectMarkers(gray)
            if ids is None or len(ids) == 0:
                continue

            # 取最近的一個 marker（tvec z 最小）
            poses = []
            for idx, marker_id in enumerate(ids.flatten()):
                rvec, tvec = estimate_pose(corners[idx], markers["markerSizeM"], k, dist)
                if tvec is not None:
                    poses.append((int(marker_id), corners[idx], rvec, tvec, float(tvec[2])))
            if not poses:
                continue
            marker_id, corner, rvec, tvec, zdist = min(poses, key=lambda item: item[4])
            zone = markers["byId"].get(marker_id)
            if zone is None:
                print(f"[skip] marker {marker_id} 唔在區位表")
                continue

            print(f"[ARUCO] id={marker_id} zone={zone['zoneId']} {describe(tvec)}")

            # 每個 zone 只做一次完整處理（避免原地重複）
            first_time = zone["zoneId"] not in handled
            if first_time:
                handled.add(zone["zoneId"])
                photo = upload_photo(bucket, run_id, zone["zoneId"], frame)
                record_step(
                    db,
                    run_id,
                    {
                        "zoneId": zone["zoneId"],
                        "markerId": marker_id,
                        "distanceM": round(zdist, 3),
                        "lateralM": round(float(tvec[0]), 3),
                        "verticalM": round(float(tvec[1]), 3),
                        "photoPath": photo,
                        "heightCm": source.height_cm(),
                        "tofCm": source.tof_cm(),
                    },
                )

            if not args.approach:
                continue

            forward, lateral = plan_step(tvec, args.stop_distance)
            if forward == 0 and lateral == 0:
                if first_time:
                    print(f"  → 已到位（≤{args.stop_distance:.2f}m），HOLD")
                continue

            print(f"  → 閉環：前進 {forward}cm、橫移 {lateral}cm")
            if args.fly:
                if lateral:
                    source.tello.move_right(lateral) if lateral > 0 else source.tello.move_left(-lateral)
                if forward:
                    source.tello.move_forward(forward)
                time.sleep(0.8)
            else:
                print("    （乾跑：唔會真的移動）")
                time.sleep(0.5)
    finally:
        source.close()
        finish_run(db, run_id)
        remaining = outbox.pending()
        print(f"[done] 處理 {len(handled)} 個 zone")
        if remaining:
            print(f"[note] outbox 仲有 {remaining} 筆，返回有網環境後 python sync_outbox.py")
    return 0


# ── 共用（同 qr 版一致）────────────────────────────────────────


def init_backend(args):
    if args.no_firestore:
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


def finish_run(db, run_id: str) -> None:
    if db is None:
        return
    try:
        db.collection("runs").document(run_id).set(
            {"status": "finished", "finishedAt": __import__("firebase_admin").firestore.SERVER_TIMESTAMP},
            merge=True,
        )
    except Exception:
        pass


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
    def __init__(self, camera_index):
        self.tello = None
        self.battery = None
        self.flying = False
        self.cap = None
        self.width = TELLO_W
        self.height = TELLO_H

        if camera_index is not None:
            self.cap = cv2.VideoCapture(camera_index)
            if not self.cap.isOpened():
                raise SystemExit(f"開唔到 camera {camera_index}")
            self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
            self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
            print(f"[source] webcam {camera_index} {self.width}x{self.height}")
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tello ArUco 導航")
    parser.add_argument("--camera", type=int, default=None, help="用 webcam 代替 Tello 鏡頭")
    parser.add_argument("--fly", action="store_true", help="真飛（配合 --takeoff）")
    parser.add_argument("--takeoff", action="store_true")
    parser.add_argument("--approach", action="store_true", help="閉環飛近 marker（每次 ≤30cm）")
    parser.add_argument("--stop-distance", type=float, default=0.7, help="停在距 marker 幾多米")
    parser.add_argument("--fx", type=float, default=DEFAULT_FX, help="相機焦距（像素），預設 900")
    parser.add_argument("--seconds", type=int, default=180)
    parser.add_argument("--min-battery", type=int, default=50)
    parser.add_argument("--no-firestore", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
