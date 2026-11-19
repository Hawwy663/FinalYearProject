<?php
// 檔案功能：管理員更新單筆巡查紀錄的處理狀態
// 新增檔案（原本 record_detail.html 的「更新狀態」只是 alert 假動作）

require_once("../shared/db.php");

header("Content-Type: application/json; charset=UTF-8");

$inspection_id = trim((string)($_POST['inspection_id'] ?? ''));
$status        = trim((string)($_POST['status'] ?? ''));

$allowed_status = ['待處理', '已通知', '已結案'];

if ($inspection_id === '') {
    json_fail("缺少巡查ID", 400);
}
if (!in_array($status, $allowed_status, true)) {
    json_fail("狀態不正確，只接受：待處理 / 已通知 / 已結案", 400);
}

try {
    $stmt = $conn->prepare("UPDATE `巡查紀錄表` SET `狀態` = ? WHERE `巡查ID` = ?");
    $stmt->bind_param("ss", $status, $inspection_id);
    $stmt->execute();

    if ($stmt->affected_rows === 0) {
        $stmt->close();
        json_fail("找不到該筆紀錄，或狀態沒有改變", 404);
    }
    $stmt->close();

    echo json_encode([
        "status"        => "success",
        "message"       => "狀態已更新",
        "inspection_id" => $inspection_id,
        "new_status"    => $status,
    ], JSON_UNESCAPED_UNICODE);
} catch (mysqli_sql_exception $e) {
    json_fail("資料庫錯誤: " . $e->getMessage());
}
