<?php
// 檔案功能：從 MySQL 讀取所有巡查紀錄，轉成 JSON 給前端使用
require_once("../shared/db.php");

// 查詢巡查紀錄表
$sql = "SELECT * FROM `巡查紀錄表` ORDER BY `時間` DESC";
$result = $conn->query($sql);

$records = array();

if ($result->num_rows > 0) {
    while($row = $result->fetch_assoc()) {
        $row['AI是否發現雜物'] = ($row['AI是否發現雜物'] === 'TRUE');
        $records[] = $row;
    }
}

echo json_encode($records, JSON_UNESCAPED_UNICODE);
?>