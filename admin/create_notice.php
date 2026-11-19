<?php
// 檔案功能：產生（登記）一張紙本清理通知，並把對應巡查紀錄標記為「已通知」
// 新增檔案（原本 print_notice.html 只有一張寫死日期的靜態樣本）

require_once("../shared/db.php");

header("Content-Type: application/json; charset=UTF-8");

$inspection_id = trim((string)($_POST['inspection_id'] ?? ''));
$deadline      = trim((string)($_POST['deadline'] ?? ''));

if ($inspection_id === '') {
    json_fail("缺少巡查ID", 400);
}

// 驗證日期格式必須是 Y-m-d 且真實存在（例如不能是 2026-02-30）
$d = DateTime::createFromFormat('Y-m-d', $deadline);
if (!$d || $d->format('Y-m-d') !== $deadline) {
    json_fail("清理限期格式不正確，需為 YYYY-MM-DD", 400);
}

try {
    // 先確認該巡查紀錄存在，並取樓層
    $check = $conn->prepare("SELECT `樓層` FROM `巡查紀錄表` WHERE `巡查ID` = ?");
    $check->bind_param("s", $inspection_id);
    $check->execute();
    $row = $check->get_result()->fetch_assoc();
    $check->close();

    if (!$row) {
        json_fail("找不到對應的巡查紀錄", 404);
    }
    $floor = $row['樓層'];

    $notice_id = "NOTIF_" . date("Ymd_His") . "_" . random_int(10, 99);

    $conn->begin_transaction();

    $insert = $conn->prepare("INSERT INTO `通知紀錄表` (`通知ID`, `巡查ID`, `樓層`, `清理限期`, `通知列印`)
                              VALUES (?, ?, ?, ?, 'TRUE')");
    $insert->bind_param("ssss", $notice_id, $inspection_id, $floor, $deadline);
    $insert->execute();
    $insert->close();

    // 通知已印出 → 巡查紀錄狀態同步為「已通知」
    $update = $conn->prepare("UPDATE `巡查紀錄表` SET `狀態` = '已通知' WHERE `巡查ID` = ?");
    $update->bind_param("s", $inspection_id);
    $update->execute();
    $update->close();

    $conn->commit();

    echo json_encode([
        "status"        => "success",
        "message"       => "通知已登記",
        "notice_id"     => $notice_id,
        "inspection_id" => $inspection_id,
        "樓層"          => $floor,
        "清理限期"      => $deadline,
    ], JSON_UNESCAPED_UNICODE);
} catch (mysqli_sql_exception $e) {
    $conn->rollback();
    json_fail("資料庫錯誤: " . $e->getMessage());
}
