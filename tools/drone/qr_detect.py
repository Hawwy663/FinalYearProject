"""多角度 QR 解碼。

實測（robustness_test.py）：OpenCV 的 QRCodeDetector 本身已經處理到旋轉（0–90° 都 OK），
但當 QR 在畫面中佔的像素太少（例如 900px 縮到 90px 以下）就會 miss。
將畫面放大再試幾個角度，可以把「細到 63px 都解得到」變成現實，代價係 CPU。

地面站每 3 幀才做一次多角度掃描，所以成本可接受。
"""

import cv2
import numpy as np

CANDIDATE_ANGLES = (0, -12, 12, -30, 30, -45, 45, 90, 180)


def rotate_expand(frame, angle):
    """旋轉並保留完整畫面（加白邊，避免裁走 QR 角落）。"""
    if angle == 0:
        return frame
    h, w = frame.shape[:2]
    diag = int(np.hypot(h, w))
    pad_x = (diag - w) // 2 + 1
    pad_y = (diag - h) // 2 + 1
    canvas = cv2.copyMakeBorder(
        frame, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=(255, 255, 255)
    )
    ch, cw = canvas.shape[:2]
    matrix = cv2.getRotationMatrix2D((cw / 2, ch / 2), angle, 1.0)
    return cv2.warpAffine(canvas, matrix, (cw, ch), borderValue=(255, 255, 255))


def decode_qr(frame, detector=None):
    """回傳第一個成功解到的 QR 內容；全部都解不到就回傳空字串。"""
    if frame is None:
        return ""
    det = detector or cv2.QRCodeDetector()
    for angle in CANDIDATE_ANGLES:
        data, _points, _ = det.detectAndDecode(rotate_expand(frame, angle))
        if data:
            return data
    return ""
