"""產生 ArUco 貼紙：DICT_4X4_50，每個巡查點一個 marker ID。

來源可以是：
  - Firestore `zones`（由網頁 AI 生成路線後寫入）→ `--from-firestore`
  - 內建預設 6 站（未連 Firestore 時）

輸出：
  public/markers/<zoneId>.png
  public/markers/markers.json   —— markerId → zone（網頁 + 地面站都會讀）
  docs/aruco-sheet.html         —— 6 張 A6 列印排版

尺寸很重要：`--marker-size` 係黑格邊長（唔計白邊），pose estimation 用佢換算距離。
列印必須「實際大小 / 100%」。

用法：
    python gen_markers.py                      # 用內建 6 站
    python gen_markers.py --from-firestore     # 用 Firestore zones（需 ADC）
"""

import argparse
import json
import sys
from pathlib import Path

import cv2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "public" / "markers"
DOCS_DIR = ROOT / "docs"
PROJECT = "fyp-backstair"

DICTIONARY = cv2.aruco.DICT_4X4_50
QUIET_MODULES = 2
CELL_PX = 100

DEFAULT_ZONES = [
    {"zoneId": "B1F01L1", "markerId": 0, "seq": 1, "floor": "1樓", "label": "一樓平台 1", "action": "HOLD", "nextZone": "B1F01L2", "move": {"forward": 120, "right": 0, "up": 0}},
    {"zoneId": "B1F01L2", "markerId": 1, "seq": 2, "floor": "1樓", "label": "一樓平台 2", "action": "HOLD", "nextZone": "B1F02L1", "move": {"forward": 120, "right": 0, "up": 80}},
    {"zoneId": "B1F02L1", "markerId": 2, "seq": 3, "floor": "2樓", "label": "二樓平台 1", "action": "HOLD", "nextZone": "B1F02L2", "move": {"forward": 120, "right": 0, "up": 0}},
    {"zoneId": "B1F02L2", "markerId": 3, "seq": 4, "floor": "2樓", "label": "二樓平台 2", "action": "HOLD", "nextZone": "B1F03L1", "move": {"forward": 120, "right": 0, "up": 80}},
    {"zoneId": "B1F03L1", "markerId": 4, "seq": 5, "floor": "3樓", "label": "三樓平台 1", "action": "HOLD", "nextZone": "B1F03L2", "move": {"forward": 120, "right": 0, "up": 0}},
    {"zoneId": "B1F03L2", "markerId": 5, "seq": 6, "floor": "3樓", "label": "三樓平台 2", "action": "LAND", "nextZone": "", "move": {"forward": 0, "right": 0, "up": 0}},
]


def fetch_zones_from_firestore():
    """讀 Firestore zones（依 seq 排序）；冇 service account 就會拋錯。"""
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": PROJECT})

    docs = firestore.client().collection("zones").order_by("seq").stream()
    zones = []
    for doc in docs:
        data = doc.to_dict() or {}
        zones.append(
            {
                "zoneId": doc.id,
                "markerId": int(data.get("markerId", len(zones))),
                "seq": int(data.get("seq", len(zones) + 1)),
                "floor": data.get("floor", ""),
                "label": data.get("label", doc.id),
                "action": data.get("action", "HOLD"),
                "nextZone": data.get("nextZone", ""),
                "move": data.get("move", {"forward": 0, "right": 0, "up": 0}),
            }
        )
    return zones


def render_marker(marker_id: int):
    dictionary = cv2.aruco.getPredefinedDictionary(DICTIONARY)
    img = cv2.aruco.generateImageMarker(dictionary, marker_id, 4 * CELL_PX)
    pad = QUIET_MODULES * CELL_PX
    return cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-firestore", action="store_true", help="由 Firestore zones 產生（AI 生成路線後用）")
    parser.add_argument("--marker-size", type=float, default=0.08, help="黑格邊長（米），預設 0.08")
    args = parser.parse_args()

    if args.from_firestore:
        try:
            zones = fetch_zones_from_firestore()
            print(f"由 Firestore 讀到 {len(zones)} 個 zone")
        except Exception as err:
            print(f"[error] 讀 Firestore 失敗：{err}")
            print("       需要 GOOGLE_APPLICATION_CREDENTIALS，或者唔加 --from-firestore 用內建路線")
            return 1
    else:
        zones = DEFAULT_ZONES

    if not zones:
        print("[error] 冇任何 zone")
        return 1

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    for zone in zones:
        png = render_marker(int(zone["markerId"]))
        out = PUBLIC_DIR / f"{zone['zoneId']}.png"
        cv2.imwrite(str(out), png)
        print(f"marker id={zone['markerId']} -> {out.name}")

    (PUBLIC_DIR / "markers.json").write_text(
        json.dumps(
            {
                "dictionary": "DICT_4X4_50",
                "markerSizeM": args.marker_size,
                "quietZoneModules": QUIET_MODULES,
                "zones": zones,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    rows = "\n".join(
        f"""    <div class="cell">
      <img src="../public/markers/{z['zoneId']}.png" alt="{z.get('floor','')} {z.get('label','')}" />
      <div class="floor">{z.get('floor','')}</div>
      <div class="label">{z.get('label','')}</div>
      <div class="meta">ArUco ID {z['markerId']} · {z['zoneId']} · 黑格 {args.marker_size * 1000:.0f}mm</div>
    </div>"""
        for z in zones
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
  <div class="warn">列印設定：A4、縮放「實際大小 / 100%」（唔好 fit to page），否則黑格尺寸唔對，距離會估錯。</div>
  <div class="sheet">
{rows}
  </div>
</body>
</html>
"""
    (DOCS_DIR / "aruco-sheet.html").write_text(html, encoding="utf-8")
    print(f"\n共 {len(zones)} 張（黑格 {args.marker_size * 1000:.0f}mm），寫出 docs/aruco-sheet.html 及 public/markers/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
