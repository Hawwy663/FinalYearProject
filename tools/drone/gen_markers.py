"""產生 ArUco 貼紙：DICT_4X4_50，每個巡查點一個 marker ID。

輸出：
  public/markers/<zoneId>.png   —— 貼紙圖（含白邊），網頁直接用
  public/markers/markers.json   —— markerId → zone 對照（網頁 + 地面站都會讀）
  docs/aruco-sheet.html         —— 6 張 A6 列印排版

為何用 OpenCV 產生而唔用 JS：無人機那邊用 OpenCV 偵測，
所以 marker 位元圖必須由 OpenCV 產生，兩邊字典先完全一致。

尺寸很重要：`MARKER_SIZE_M` 係**黑格邊長**（唔計白邊），
pose estimation 用佢換算距離。列印時一定要「實際大小 / 100%」，唔好讓印表機縮放。

用法：python gen_markers.py
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "public" / "markers"
DOCS_DIR = ROOT / "docs"

DICTIONARY = cv2.aruco.DICT_4X4_50

ZONES = [
    {"zoneId": "B1F01L1", "markerId": 0, "seq": 1, "floor": "1樓", "label": "一樓平台 1", "nextZone": "B1F01L2"},
    {"zoneId": "B1F01L2", "markerId": 1, "seq": 2, "floor": "1樓", "label": "一樓平台 2", "nextZone": "B1F02L1"},
    {"zoneId": "B1F02L1", "markerId": 2, "seq": 3, "floor": "2樓", "label": "二樓平台 1", "nextZone": "B1F02L2"},
    {"zoneId": "B1F02L2", "markerId": 3, "seq": 4, "floor": "2樓", "label": "二樓平台 2", "nextZone": "B1F03L1"},
    {"zoneId": "B1F03L1", "markerId": 4, "seq": 5, "floor": "3樓", "label": "三樓平台 1", "nextZone": "B1F03L2"},
    {"zoneId": "B1F03L2", "markerId": 5, "seq": 6, "floor": "3樓", "label": "三樓平台 2", "nextZone": ""},
]

# 黑格邊長（米）。A6 紙張上印 80mm 黑格 + 每邊 2 模組白邊 = 120mm 總寬。
MARKER_SIZE_M = 0.08
QUIET_MODULES = 2
CELL_PX = 100


def render_marker(marker_id: int) -> np.ndarray:
    """產生 marker（含 1 模組黑框），再加大白邊。"""
    dictionary = cv2.aruco.getPredefinedDictionary(DICTIONARY)
    img = cv2.aruco.generateImageMarker(dictionary, marker_id, 4 * CELL_PX)
    pad = QUIET_MODULES * CELL_PX
    return cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)


def main() -> int:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    for zone in ZONES:
        png = render_marker(zone["markerId"])
        out = PUBLIC_DIR / f"{zone['zoneId']}.png"
        cv2.imwrite(str(out), png)
        print(f"marker id={zone['markerId']} -> {out.name} ({png.shape[1]}px)")

    (PUBLIC_DIR / "markers.json").write_text(
        json.dumps(
            {
                "dictionary": "DICT_4X4_50",
                "markerSizeM": MARKER_SIZE_M,
                "quietZoneModules": QUIET_MODULES,
                "zones": ZONES,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    rows = "\n".join(
        f"""    <div class="cell">
      <img src="../public/markers/{z['zoneId']}.png" alt="{z['floor']} {z['label']}" />
      <div class="floor">{z['floor']}</div>
      <div class="label">{z['label']}</div>
      <div class="meta">ArUco ID {z['markerId']} · {z['zoneId']} · 黑格 {MARKER_SIZE_M * 1000:.0f}mm</div>
    </div>"""
        for z in ZONES
    )

    html = f"""<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="UTF-8" />
<title>樓梯間 ArUco 貼紙</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: "Microsoft JhengHei", "Segoe UI", sans-serif; background: #fff; color: #111; }}
  .sheet {{ display: grid; grid-template-columns: repeat(2, 1fr); }}
  .cell {{ border: 1px dashed #999; padding: 6mm; text-align: center; height: 148mm;
           page-break-inside: avoid; break-inside: avoid;
           display: flex; flex-direction: column; align-items: center; justify-content: center; }}
  .cell img {{ width: 120mm; height: 120mm; image-rendering: pixelated; }}
  .floor {{ font-size: 18pt; font-weight: 800; margin-top: 3mm; }}
  .label {{ font-size: 11pt; }}
  .meta {{ font-size: 8.5pt; color: #555; margin-top: 1mm; }}
  .warn {{ font-size: 9pt; color: #b33; padding: 4mm 6mm; }}
  @page {{ size: A4; margin: 4mm; }}
  @media print {{ .cell {{ border: 1px solid #ccc; }} .warn {{ display: none; }} }}
</style>
</head>
<body>
  <div class="warn">列印設定：紙張 A4、縮放「實際大小 / 100%」（唔好揀「fit to page」），否則黑格尺寸唔對，距離會估錯。</div>
  <div class="sheet">
{rows}
  </div>
</body>
</html>
"""
    (DOCS_DIR / "aruco-sheet.html").write_text(html, encoding="utf-8")
    print(f"\n共 {len(ZONES)} 張（黑格 {MARKER_SIZE_M * 1000:.0f}mm），寫出 docs/aruco-sheet.html 及 public/markers/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
