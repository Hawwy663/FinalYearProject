export default function Loading({ label = '載入中…' }) {
  return (
    <div className="page center">
      <div className="spinner" aria-label={label} />
      <p className="muted">{label}</p>
    </div>
  );
}
