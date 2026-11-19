# FinalYearProject — 後樓梯消防巡查管理系統

用無人機巡查大廈後樓梯、以 AI 偵測堆放雜物，再由管理員跟進、發出紙本清理通知的示範系統。
本 repo 目前包含**網頁前端 + PHP API + MySQL 資料表**；AI 模型（`backstair_5class_v*.pt`）已訓練好但**尚未接入網頁流程**。

## 目錄結構

```
admin/            管理員後台（桌面版介面）
  admin.html            總覽 dashboard：統計 + 違規紀錄列表
  record_detail.html    單筆違規詳情、更新處理狀態
  print_notice.html     清理通知單預覽與列印（可改限期）
  get_inspections.php   讀取巡查紀錄（GET，可帶 ?id= 取單筆）
  update_status.php     更新處理狀態（POST）
  create_notice.php     登記通知並把紀錄標記為「已通知」（POST）
staff/            員工端（手機版介面）
  index.html            巡查控制頁（開始／上傳記錄／暫停／繼續）
  upload_result.html    上傳成功／失敗結果頁
  save_record.php       寫入巡查紀錄（POST）
shared/           共用資源
  db.php                MySQL 連線（mysqli，prepared statement 前置設定）
  style.css             全站樣式
fyp_db.sql        資料庫建表 + 假資料（可直接匯入）
backstair_5class_v4_best.pt        AI 模型：5 類別物件偵測（已驗證版本）
backstair_5class_v5_candidate_best.pt  AI 模型：v5 候選版本
```

## 系統流程

1. **員工端**（手機）選擇樓層 → 開始巡查 → 上傳記錄
   `staff/index.html` → `POST staff/save_record.php` → 寫入 `巡查紀錄表`
2. **管理員端**（電腦）查看總覽與違規清單
   `admin/admin.html` → `GET admin/get_inspections.php`
3. 點「查看詳情」→ 檢視 AI 照片 → 更新狀態
   `admin/record_detail.html` → `POST admin/update_status.php`
4. 點「生成紙本報告」→ 設定清理限期 → 確認列印
   `admin/print_notice.html` → `POST admin/create_notice.php` → 寫入 `通知紀錄表`，並把該巡查紀錄狀態改為「已通知」

處理狀態只有三種：`待處理` → `已通知` → `已結案`。

## 資料庫

`fyp_db.sql` 會建立資料庫 `fyp_db` 與兩張表：

| 表 | 用途 | 主要欄位 |
|---|---|---|
| `巡查紀錄表` | 每次巡查的結果 | 巡查ID / 樓層 / 照片 / AI是否發現雜物 / 狀態 / 時間 |
| `通知紀錄表` | 已發出的紙本通知 | 通知ID / 巡查ID / 樓層 / 清理限期 / 通知列印 |

## 本機執行

### 前置：XAMPP（Apache + MySQL + PHP）

專案用 PHP 8（XAMPP 內建 `C:\xampp\php\php.exe`）與 MySQL/MariaDB，連線設定在 `shared/db.php`
（`127.0.0.1` / `root` / 空密碼 / `fyp_db`）。

1. 開 **XAMPP Control Panel** → `Start` **Apache** 同 **MySQL**
2. 匯入資料表（二選一）
   - phpMyAdmin：<http://localhost/phpmyadmin> → 匯入 → 揀 `fyp_db.sql`
   - 命令列：
     ```powershell
     C:\xampp\mysql\bin\mysql.exe -u root -e "source C:/path/to/fyp_db.sql"
     ```
3. 開網站：<http://localhost/FinalYearProject/staff/index.html>
   （前提係專案放喺 `C:\xampp\htdocs\FinalYearProject`）

### 唔用 Apache 的代替方法（PHP 內建 server）

只要 MySQL 有跑，喺專案根目錄執行：

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8080
```

然後開 <http://127.0.0.1:8080/staff/index.html>。
（PHP 內建 server 冇 `.htaccess`／rewrite 支援，本專案亦唔需要。）

## 已知限制 / 下一步

- **冇登入認證**：任何人開得到 `admin/`，示範用；正式要加 session 或登入頁
- **員工端上傳仍是模擬**：`staff/index.html` 的樓層、照片、AI 結果都寫死，未接真實無人機與模型輸出
- **AI 模型未接入網頁**：`.pt` 模型未有 Python 推論服務，`照片` 欄只存圖片 URL / 路徑
- **`shared/db.php` 是開發用設定**：`root` + 空密碼 + `Access-Control-Allow-Origin: *`，上線前必須改
- 開始巡查／暫停／繼續三粒掣仍未有無線電指令實作
