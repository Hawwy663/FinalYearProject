import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';

function authErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '電郵或密碼不正確';
    case 'auth/invalid-email':
      return '電郵格式不正確';
    case 'auth/too-many-requests':
      return '嘗試次數太多，請稍後再試';
    case 'auth/network-request-failed':
      return '網絡連線失敗，請檢查網絡';
    default:
      return '登入失敗，請再試一次';
  }
}

export default function Login() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="載入中…" />;
  if (user) return <Navigate to={role === 'admin' ? '/admin' : '/staff'} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const target = location.state?.from;
      navigate(target && target !== '/login' ? target : '/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page center">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">FYP</div>
          <div>
            <h1>後樓梯消防巡查系統</h1>
            <p className="muted">無人機巡查 · AI 雜物偵測 · 通知管理</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            <span>電郵</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@fyp.local"
              required
            />
          </label>

          <label className="field">
            <span>密碼</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error ? <p className="alert alert-error">{error}</p> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '登入中…' : '登入'}
          </button>
        </form>

        <div className="demo-hint">
          <p className="muted">示範帳號</p>
          <ul>
            <li>
              <code>admin@fyp.local</code> / <code>Admin1234!</code>（管理員）
            </li>
            <li>
              <code>staff@fyp.local</code> / <code>Staff1234!</code>（巡查員）
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
