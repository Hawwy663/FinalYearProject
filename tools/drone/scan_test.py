"""唔需要無人機：用圖片或 webcam 驗證 QR 解碼 + payload 校驗。

用法：
    python scan_test.py --dir ../../docs/qr
    python scan_test.py --camera 0
"""

import argparse
import glob
import sys
from pathlib import Path

import cv2

from qr_detect import decode_qr
from qr_payload import decode_payload

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def scan_image(path: Path) -> None:
    frame = cv2.imread(str(path))
    if frame is None:
        print(f"[miss] 讀唔到 {path.name}")
        return
    data = decode_qr(frame)
    if not data:
        print(f"[miss] {path.name} 解不到 QR")
        return
    try:
        payload = decode_payload(data)
        print(f"[ok  ] {path.name} -> {payload}  ({data})")
    except ValueError as err:
        print(f"[bad ] {path.name} -> {data!r}  ({err})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="../../docs/qr", help="QR PNG 目錄")
    parser.add_argument("--camera", type=int, default=None, help="用 webcam 即時測試")
    args = parser.parse_args()

    if args.camera is not None:
        cap = cv2.VideoCapture(args.camera)
        print("按 q 離開")
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            data = decode_qr(frame)
            if data:
                try:
                    print("QR:", decode_payload(data), data)
                except ValueError as err:
                    print("QR 無效:", data, err)
            cv2.imshow("scan", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
        cap.release()
        cv2.destroyAllWindows()
        return 0

    files = sorted(glob.glob(str(Path(args.dir) / "*.png")))
    if not files:
        print(f"冇搵到 PNG：{args.dir}")
        return 1
    for f in files:
        scan_image(Path(f))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
