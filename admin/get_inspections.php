<?php
// 檔案功能：從 MySQL 讀取巡查紀錄，轉成 JSON 給前端使用
// 帶 ?id=XXX 時只回傳單筆（回傳物件而非陣列）

require_once("../shared/db.php");

header("Content-Type: application/json; charset=UTF-8");

$id = trim((string)($_GET['id'] ?? ''));

try {
    if ($id !== '') {
        $stmt = $conn->prepare("SELECT * FROM `巡查紀錄表` WHERE `巡查ID` = ? LIMIT 1");
        $stmt->bind_param("s", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            json_fail("找不到該筆資料", 404);
        }
        $row['AI是否發現雜物'] = ($row['AI是否發現雜物'] === 'TRUE');
        echo json_encode($row, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $result  = $conn->query("SELECT * FROM `巡查紀錄表` ORDER BY `時間` DESC");
    $records = [];

    while ($row = $result->fetch_assoc()) {
        $row['AI是否發現雜物'] = ($row['AI是否發現雜物'] === 'TRUE');
        $records[] = $row;
    }
    $result->free();

    echo json_encode($records, JSON_UNESCAPED_UNICODE);
} catch (mysqli_sql_exception $e) {
    json_fail("資料庫錯誤: " . $e->getMessage());
}
