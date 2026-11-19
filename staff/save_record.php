<?php
// 檔案功能：接收員工端上傳的紀錄，寫入 MySQL 資料庫
// 引入共用的資料庫連線檔
require_once("../shared/db.php");

// 接收前端透過 FormData 傳來的 POST 資料 (如果沒收到則給預設值)
$floor = $_POST['floor'] ?? '未知樓層';
$image_url = $_POST['image_url'] ?? '';
$ai_detected = $_POST['ai_detected'] ?? 'FALSE';

$inspection_id = $floor . "_" . date("Ymd_His") . "_" . rand(10,99);
$current_time = date("Y-m-d H:i:s");

// 寫入資料庫的 SQL 語法
$sql = "INSERT INTO `巡查紀錄表` (`巡查ID`, `樓層`, `照片`, `AI是否發現雜物`, `狀態`, `時間`) 
        VALUES ('$inspection_id', '$floor', '$image_url', '$ai_detected', '待處理', '$current_time')";

// 執行 SQL 並回傳 JSON 結果給前端
if ($conn->query($sql) === TRUE) {
    echo json_encode(["status" => "success", "message" => "寫入成功"]);
} else {
    echo json_encode(["status" => "error", "message" => "資料庫錯誤: " . $conn->error]);
}
?>