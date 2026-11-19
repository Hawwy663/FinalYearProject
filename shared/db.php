<?php
// 共用資料庫連線：include 之後可用 $conn（mysqli）
// PHP 8.1+ 的 mysqli 預設會拋出 exception，所以連線與查詢都要 try/catch，
// 令前端永遠收到 JSON 而唔會見到 PHP 的錯誤頁。

// 統一用香港時間，否則 PHP 預設 UTC 會令「時間」欄同「今日上傳」統計差 8 小時
date_default_timezone_set('Asia/Hong_Kong');

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$host   = "127.0.0.1";
$user   = "root";
$pwd    = "";
$dbname = "fyp_db";

/**
 * 以 JSON 回報錯誤並結束請求。
 */
function json_fail(string $message, int $code = 500): void
{
    http_response_code($code);
    echo json_encode(["status" => "error", "message" => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conn = new mysqli($host, $user, $pwd, $dbname);
    $conn->set_charset("utf8mb4");
} catch (mysqli_sql_exception $e) {
    json_fail("資料庫連線失敗: " . $e->getMessage());
}
