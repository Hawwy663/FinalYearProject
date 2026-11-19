<?php
// 檔案功能：接收員工端上傳的巡查紀錄，寫入 MySQL 資料庫
// 改動：用 prepared statement 防止 SQL injection；驗證輸入長度與格式。

require_once("../shared/db.php");

header("Content-Type: application/json; charset=UTF-8");

$floor      = trim((string)($_POST['floor'] ?? ''));
$image_url  = trim((string)($_POST['image_url'] ?? ''));
$ai_detected = strtoupper(trim((string)($_POST['ai_detected'] ?? 'FALSE'))) === 'TRUE' ? 'TRUE' : 'FALSE';

// --- 輸入驗證 ---
if ($floor === '') {
    json_fail("缺少樓層", 400);
}
if (mb_strlen($floor) > 20) {
    json_fail("樓層名稱過長", 400);
}
if (mb_strlen($image_url) > 255) {
    json_fail("照片路徑過長（上限 255 字元）", 400);
}
if ($image_url !== '' && !filter_var($image_url, FILTER_VALIDATE_URL) && !str_starts_with($image_url, '/')) {
    json_fail("照片路徑格式不正確", 400);
}

$inspection_id = $floor . "_" . date("Ymd_His") . "_" . random_int(10, 99);
$current_time  = date("Y-m-d H:i:s");

$sql = "INSERT INTO `巡查紀錄表` (`巡查ID`, `樓層`, `照片`, `AI是否發現雜物`, `狀態`, `時間`)
        VALUES (?, ?, ?, ?, '待處理', ?)";

try {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sssss", $inspection_id, $floor, $image_url, $ai_detected, $current_time);
    $stmt->execute();
    $stmt->close();

    echo json_encode([
        "status"        => "success",
        "message"       => "寫入成功",
        "inspection_id" => $inspection_id,
    ], JSON_UNESCAPED_UNICODE);
} catch (mysqli_sql_exception $e) {
    json_fail("資料庫錯誤: " . $e->getMessage());
}
