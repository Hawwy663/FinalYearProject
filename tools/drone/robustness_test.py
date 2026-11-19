"""QR 解碼穩健度測試：模擬實地會遇到的情況，量度「幾惡劣之下仍然解到」。

模擬：縮細（距離遠）、模糊（失焦／移動）、變暗（樓梯光線差）、旋轉（機身傾斜）。
同時比較「單次解碼」與「多角度重試」的分別，作為報告數據。

用法：python robustness_test.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

from qr_detect import decode_qr
from qr_payload import decode_payload

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

QR_DIR = Path(__file__).resolve().parents[2] / "docs" / "qr"


def single_decode(frame) -> str:
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(frame)
    return data


def scaled(img, factor):
    h, w = img.shape[:2]
    return cv2.resize(img, (int(w * factor), int(h * factor)), interpolation=cv2.INTER_AREA)


def blurred(img, ksize):
    return cv2.GaussianBlur(img, (ksize, ksize), 0)


def darkened(img, factor):
    return np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)


def rotated(img, angle):
    """貼在白紙上再旋轉（保留整張紙，唔裁走 QR 角落）——模擬機身傾斜。"""
    h, w = img.shape[:2]
    pad = int(max(h, w) * 0.45)
    canvas = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    ch, cw = canvas.shape[:2]
    matrix = cv2.getRotationMatrix2D((cw / 2, ch / 2), angle, 1.0)
    return cv2.warpAffine(canvas, matrix, (cw, ch), borderValue=(255, 255, 255))


def main() -> int:
    files = sorted(QR_DIR.glob("*.png"))
    if not files:
        print("冇 QR PNG，請先 npm run qr:sheet")
        return 1

    img = cv2.imread(str(files[0]))
    print(f"測試樣本: {files[0].name}  尺寸 {img.shape[1]}x{img.shape[0]}")
    print("（左：單次解碼　右：多角度重試）\n")

    print("== 縮細（模擬距離）==")
    for factor in (1.0, 0.5, 0.25, 0.15, 0.10, 0.07):
        small = scaled(img, factor)
        print(
            f"  {factor:>4.2f} ({int(img.shape[1]*factor):>3}px 寬): "
            f"{'OK  ' if single_decode(small) else 'miss'}  /  {'OK' if decode_qr(small) else 'miss'}"
        )

    print("\n== 模糊 ==")
    for k in (3, 7, 15, 25, 35):
        blur = blurred(img, k)
        print(f"  gaussian k={k:<3}: {'OK' if single_decode(blur) else 'miss'}  /  {'OK' if decode_qr(blur) else 'miss'}")

    print("\n== 變暗 ==")
    for factor in (0.7, 0.5, 0.3, 0.2, 0.12):
        dark = darkened(img, factor)
        print(f"  brightness x{factor:<4}: {'OK' if single_decode(dark) else 'miss'}  /  {'OK' if decode_qr(dark) else 'miss'}")

    print("\n== 旋轉 ==")
    for angle in (5, 15, 30, 45, 60, 90):
        spin = rotated(img, angle)
        print(f"  {angle:>2}°: {'OK' if single_decode(spin) else 'miss'}  /  {'OK' if decode_qr(spin) else 'miss'}")

    print("\n== payload 校驗 ==")
    data = decode_qr(img)
    if data:
        print("  ", decode_payload(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
