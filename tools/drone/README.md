# 地面站（Tello Talent + ArUco）

呢個資料夾係無人機側嘅程式。**網站負責印貼紙，呢邊負責偵測、算距離、飛。**

用 **ArUco**（`DICT_4X4_50`）而唔用 QR，因為 ArUco 可以做到 pose estimation：
唔止知道「面前有 marker 0」，仲算得出**距離 1.2m、偏右 0.15m**，所以閉環飛近係可行嘅。

## 安裝

```powershell
cd tools\drone
python -m pip install -r requirements.txt
```

需要：Python 3.10+、Windows 防火牆放行 UDP 8889 / 8890 / 11111（第一次連 Tello 會彈窗，要按「允許」）。

## 三個唔使飛嘅測試

```powershell
python gen_markers.py     # 產生 6 張 ArUco 貼紙（public/markers/ + docs/aruco-sheet.html）
python aruco_test.py      # 合成影像驗證：距離/橫向準確度、可偵測距離上限
python aruco_nav.py --camera 0   # 用 laptop 鏡頭即時試（印張紙出嚟對住）
```

`aruco_test.py` 實測結果（8cm 黑格、fx=900）：

| 真值距離 | 估計 | 誤差 |
|---|---|---|
| 0.5m | 0.50m | −0.6% |
| 1.2m | 1.18m | −1.4% |
| 2.0m | 1.96m | −2.1% |
| 3.0m | 2.92m | −2.5% |

- 橫向偏移誤差 < 1cm
- 可偵測距離上限：約 **3.5m**（再遠就解不到）
- 所以設計上「每 1–2m 一個 marker」，正好喺有效範圍內

## 列印貼紙（重要）

```powershell
python gen_markers.py
start ../../docs/aruco-sheet.html    # 或 docs/aruco-sheet.pdf
```

**列印一定要揀「實際大小 / 100%」**，唔好「fit to page」。貼紙上黑格 = 80mm，
`public/markers/markers.json` 的 `markerSizeM` 也是 0.08。印細了 → 距離估細；印大了 → 距離估大。

貼法：平台牆身、正對鏡頭、高度 1.2–1.5m、避免反光／背光。

## 連 Tello

1. Tello 開機，laptop 連 WiFi `TELLO-XXXXXX`（連上之後**冇互聯網**，係正常）
2. 乾跑（唔開槳）：

```powershell
python aruco_nav.py
```

3. 真飛，並且閉環飛近 marker：

```powershell
python aruco_nav.py --fly --takeoff --approach --seconds 120
```

## 行為

| 模式 | 做咩 |
|---|---|
| 預設（乾跑） | 偵測 marker、印 distance/橫向偏移、影相、寫 Firestore |
| `--approach` | 依 pose 每次飛 ≤30cm（前進／橫移），重新偵測，直到距 marker 0.7m |
| `--fly --takeoff` | 真的起飛；冇 `--approach` 就懸停影相 |

同一個 zone 只會完整處理一次。偵測不到 marker **唔會盲飛**。

## 參數

| 參數 | 預設 | 意思 |
|---|---|---|
| `--stop-distance` | 0.7 | 停在距 marker 幾多米 |
| `--fx` | 900 | 相機焦距（像素）。要更準就做棋盤校正後填入 |
| `--min-battery` | 50 | 低過就拒絕起飛 |
| `--seconds` | 180 | 執行時間上限 |
| `--no-firestore` | — | 完全唔寫雲端，只入 outbox |

## 冇互聯網點寫 Firestore？

連住 Tello WiFi 時寫唔到雲端，`aruco_nav.py` 會自動 fallback：

```
→ Firestore 寫入失敗，入 outbox
```

落地後（連返有網 WiFi）：

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\serviceAccount.json"
python sync_outbox.py
```

## 疑難排解

| 症狀 | 處理 |
|---|---|
| `tello.connect()` timeout | 未連 TELLO WiFi；或防火牆擋 UDP 8889 |
| 偵測不到 marker | 太遠（>3.5m）、太細、反光、marker 貼歪超過 ~45° |
| 距離估錯一半 | 列印縮放錯（印成 40mm 但 json 寫 80mm） |
| `firebase_admin` 初始化失敗 | 未設 `GOOGLE_APPLICATION_CREDENTIALS`；乾跑可加 `--no-firestore` |
