"""ArUco 管線驗證（唔需要無人機）。

做兩件事：
1. 把 marker 用相機投影「合成」到畫面裡，模擬已知距離/偏移，再跑偵測 + pose
   → 對照估計值同真值，證明數學正確。
2. 量度「幾多米仍然偵測到」。

用法：python aruco_test.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

from aruco_nav import DEFAULT_FX, TELLO_H, TELLO_W, build_detector, camera_matrix, estimate_pose, load_markers

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
MARKER_DIR = ROOT / "public" / "markers"


def marker_patch(zone_id: str) -> np.ndarray:
    """取出 marker 圖中「黑框」那一塊（裁走白邊），做投影用。"""
    img = cv2.imread(str(MARKER_DIR / f"{zone_id}.png"), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise SystemExit(f"讀唔到 {zone_id}.png，請先 python gen_markers.py")
    # 用「有黑像素」的邊界框自動裁走 quiet zone，唔靠硬編碼比例
    mask = img < 128
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    return img[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]


def synthesize(patch: np.ndarray, k: np.ndarray, distance: float, lateral: float, size_m: float, w=TELLO_W, h=TELLO_H):
    """把 marker 投影到畫面，模擬相機在 (0,0,0) 望向 +Z。"""
    half = size_m / 2
    # 順序要跟圖像座標：左上、右上、右下、左下（相機 y 向下）
    corners_3d = np.array(
        [[-half, -half, distance], [half, -half, distance], [half, half, distance], [-half, half, distance]],
        dtype=np.float64,
    )
    corners_3d = corners_3d + np.array([[lateral, 0, 0]], dtype=np.float64)
    projected, _ = cv2.projectPoints(corners_3d, np.zeros((3, 1)), np.zeros((3, 1)), k, np.zeros((5, 1)))
    quad = projected.reshape(4, 2).astype(np.float32)

    canvas = np.full((h, w), 255, np.uint8)
    side = patch.shape[0]
    src = np.array([[0, 0], [side - 1, 0], [side - 1, side - 1], [0, side - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, quad)
    warped = cv2.warpPerspective(patch, matrix, (w, h), borderValue=255)
    mask = cv2.warpPerspective(np.full_like(patch, 255), matrix, (w, h), borderValue=0)
    canvas[mask > 0] = warped[mask > 0]
    return canvas


def main() -> int:
    info = load_markers()
    size_m = info["markerSizeM"]
    detector = build_detector(info["dictionary"])
    k = camera_matrix(TELLO_W, TELLO_H, DEFAULT_FX)

    zone = info["byId"][0]
    patch = marker_patch(zone["zoneId"])
    print(f"marker 尺寸 {size_m*100:.0f}cm, fx={DEFAULT_FX}, 字典 {info['dictionary']}\n")

    print("== 距離準確度（合成影像）==")
    print(f"{'真值':>6} {'估計':>7} {'誤差':>7}  偵測ID")
    for distance in (0.5, 0.8, 1.2, 2.0, 3.0, 4.0):
        frame = synthesize(patch, k, distance, 0.0, size_m)
        corners, ids, _ = detector.detectMarkers(frame)
        if ids is None or len(ids) == 0:
            print(f"{distance:>5.1f}m    miss      -   -")
            continue
        rvec, tvec = estimate_pose(corners[0], size_m, k, np.zeros((5, 1)))
        est = float(tvec[2])
        err = (est - distance) / distance * 100
        print(f"{distance:>5.1f}m {est:>6.2f}m {err:>+6.1f}%  id={ids.flatten()[0]}")

    print("\n== 橫向偏移（應該估到同真值接近）==")
    for lateral in (-0.4, -0.2, 0.0, 0.2, 0.4):
        frame = synthesize(patch, k, 1.5, lateral, size_m)
        corners, ids, _ = detector.detectMarkers(frame)
        if ids is None or len(ids) == 0:
            print(f"  真值 {lateral:+.2f}m: miss")
            continue
        _, tvec = estimate_pose(corners[0], size_m, k, np.zeros((5, 1)))
        print(f"  真值 {lateral:+.2f}m → 估計 {float(tvec[0]):+.2f}m")

    print("\n== 距離上限（多少米仍然偵測到）==")
    last_ok = 0.0
    for distance in np.arange(0.5, 8.0, 0.5):
        frame = synthesize(patch, k, float(distance), 0.0, size_m)
        corners, ids, _ = detector.detectMarkers(frame)
        if ids is not None and len(ids) > 0:
            last_ok = float(distance)
        else:
            print(f"  {distance:.1f}m 起偵測唔到（最後成功 {last_ok:.1f}m）")
            break
    print(f"  → {size_m*100:.0f}cm marker 可偵測到約 {last_ok:.1f}m（畫面只佔幾十像素已經夠）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
