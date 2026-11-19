"""匯出 ArUco DICT_4X4_50 位元圖，供網頁用 SVG 即時畫 marker。

為何要匯出：網頁（JS）冇 OpenCV，但只要有位元圖就可以用 SVG 畫出同一個 marker。
呢個 JSON 由 OpenCV 產生，所以同無人機偵測用的字典 100% 一致。

輸出：public/markers/dict-4x4-50.json
  { "dictionary": "DICT_4X4_50", "modules": 6, "codes": ["010110...", ...] }
  每個 code 係 6x6（1 模組黑框 + 4x4 資料）的位元字串，'1' = 黑。
"""

import json
import sys
from pathlib import Path

import cv2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "markers" / "dict-4x4-50.json"

MODULES = 6
PX_PER_MODULE = 20
SIDE_PX = MODULES * PX_PER_MODULE


def main() -> int:
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    codes = []

    for marker_id in range(50):
        img = cv2.aruco.generateImageMarker(dictionary, marker_id, SIDE_PX)
        bits = []
        for row in range(MODULES):
            for col in range(MODULES):
                # 取模組中心的像素，避免邊界抗鋸齒
                y = row * PX_PER_MODULE + PX_PER_MODULE // 2
                x = col * PX_PER_MODULE + PX_PER_MODULE // 2
                bits.append("1" if img[y, x] < 128 else "0")
        codes.append("".join(bits))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"dictionary": "DICT_4X4_50", "modules": MODULES, "codes": codes}, indent=0),
        encoding="utf-8",
    )

    print(f"匯出 {len(codes)} 個 marker → {OUT.relative_to(ROOT)}")
    print("id 0:", codes[0])
    print("id 1:", codes[1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
