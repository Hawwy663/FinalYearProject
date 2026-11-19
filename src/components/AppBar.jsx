import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AppBar({ title, backTo }) {
  const { profile, user, role, logout } = useAuth();
  const navigate = useNavigate();
  const roleLabel = role === 'admin' ? '管理員' : '巡查員';
  // displayName 有時就係角色名（例如種子帳號），做成重複，所以只顯示唔同嘅值
  const identity = profile?.displayName && profile.displayName !== roleLabel
    ? profile.displayName
    : profile?.email || user?.email;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="appbar-title">
          {backTo ? (
            <Link to={backTo} className="back" aria-label="返回">
              ←
            </Link>
          ) : null}
          <span>{title}</span>
        </div>
        <div className="appbar-user">
          <span className={`chip chip-${role}`}>{roleLabel}</span>
          <span className="appbar-email">{identity}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>
    </header>
  );
}
