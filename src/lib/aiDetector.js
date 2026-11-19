/**
 * AI 雜物偵測 — 目前係 stub。
 *
 * 真實系統應該由 Cloud Function（或 Python 推論服務）載入
 * `backstair_5class_v5_candidate_best.pt` 推論，前端只負責上傳同顯示結果。
 * 呢個 stub 用意係保持介面／資料格式一致，換真模型時只需改呢一個檔案：
 *   runStubDetector(blob) -> { aiDetected, aiConfidence, aiEngine }
 */

const ENGINE = 'stub-v0（未接駁 .pt 模型）';

export async function runStubDetector(blob) {
  // 用圖片內容做一個穩定但無意義的啟發式，令 demo 有時有／有時無違規。
  const buf = new Uint8Array(await blob.arrayBuffer());
  let hash = 0;
  for (let i = 0; i < buf.length; i += 97) {
    hash = (hash * 31 + buf[i]) % 100000;
  }
  const ratio = (hash % 100) / 100;

  return {
    aiDetected: ratio >= 0.5,
    aiConfidence: Number(ratio.toFixed(2)),
    aiEngine: ENGINE,
  };
}

export const DETECTOR_IS_STUB = true;
