const DATE_FMT = new Intl.DateTimeFormat('zh-HK', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(value);
}

export function formatDateTime(value) {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : '—';
}

/** 本機時區的 YYYY-MM-DD。 */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isToday(value) {
  const d = toDate(value);
  return d ? todayKey(d) === todayKey() : false;
}

/** 今日 +n 日，回傳 YYYY-MM-DD（給 date input 用）。 */
export function dateInputValue(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return todayKey(d);
}

export function formatChineseDate(value) {
  if (!value) return '＿＿＿＿年＿＿月＿＿日';
  const [y, m, d] = String(value).split('-');
  if (!y || !m || !d) return value;
  return `${y}年${Number(m)}月${Number(d)}日`;
}
