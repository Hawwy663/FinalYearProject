# 地面站（Tello Talent + QR）

呢個資料夾係無人機側嘅程式。**網站負責產生 QR，呢邊負責飛同解碼。**

## 安裝

```powershell
cd tools\drone
python -m pip install -r requirements.txt
```

需要：Python 3.10+、Windows 防火牆放行 UDP 8889 / 8890 / 11111（第一次連 Tello 會彈窗，要按「允許」）。

## 三個測試（唔需要飛）

```powershell
python qr_payload.py                  # payload 編解碼 golden test
python scan_test.py --dir ..\..\docs\qr   # 掃 docs/qr 內的 6 張 QR
python robustness_test.py             # 距離／模糊／光線／角度穩健度
```

`scan_test.py --camera 0` 可以用 laptop 鏡頭即時試（印張紙出嚟對住鏡頭）。

## 連 Tello

1. Tello 開機，laptop 連 WiFi `TELLO-XXXXXX`（連上之後**冇互聯網**，係正常）
2. 先跑乾跑模式（唔開槳，只用鏡頭）：

```powershell
python qr_hop.py
```

3. 真飛（**先讀 SAFETY.md**）：

```powershell
python qr_hop.py --fly --takeoff --seconds 120
```

## 行為

| QR 的 action | 乾跑 | 真飛 |
|---|---|---|
| `HOLD` | 影相 + 寫紀錄 | 影相 + 寫紀錄，原地懸停 |
| `TURN90` | 影相 + 寫紀錄 | 右轉 90° |
| `LAND` | 影相 + 寫紀錄 | 降落並結束 |
| `NONE` | 只記錄 | 只記錄 |

同一個 `zoneId` 只會處理一次（避免機身晃動時原地打圈）。

## 冇互聯網點寫 Firestore？

連住 Tello WiFi 時寫唔到雲端，`qr_hop.py` 會自動 fallback：

```
→ Firestore 寫入失敗，入 outbox
```

落地後（連返有網 WiFi），設定 service account 再同步：

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\serviceAccount.json"
python sync_outbox.py
```

## 已驗證結果（`robustness_test.py`）

| 情況 | 單次解碼 | 多角度重試 |
|---|---|---|
| QR 縮到 90px / 63px 寬 | miss | **OK** |
| 模糊 Gaussian k=35 | OK | OK |
| 光度 x0.12 | OK | OK |
| 旋轉 5°–90° | OK | OK |

結論：印刷貼紙用 A5、貼 1–1.5m 高，距離 0.5–1.5m 掃，成功率足夠；**唔需要貼到超大張**。

## 疑難排解

| 症狀 | 處理 |
|---|---|
| `tello.connect()` timeout | 未連上 TELLO WiFi；或防火牆擋 UDP 8889 |
| 畫面全黑 | `streamon` 未成功；重跑，或先開 Tello App 確認相機正常 |
| 解不到 QR | 用 `--camera 0` 對住貼紙試；調光；確認貼紙冇反光 |
| `firebase_admin` 初始化失敗 | 未設 `GOOGLE_APPLICATION_CREDENTIALS`；乾跑可用 `--no-firestore` |
| 電量 < 50% 拒絕起飛 | 充電；或調 `--min-battery`（唔建議） |
