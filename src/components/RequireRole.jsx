import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';

/**
 * 角色守門：未登入 → /login；角色不符 → 顯示 403（唔會靜靜雞彈去第二頁）。
 */
export default function RequireRole({ roles, children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="核對權限中…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!role) {
    return (
      <div className="page center">
        <div className="card">
          <h1>未設定角色</h1>
          <p className="muted">
            你嘅帳號（{user.email}）冇 `users/&lt;uid&gt;` 角色文件，請聯絡管理員設定。
          </p>
        </div>
      </div>
    );
  }

  if (!roles.includes(role)) {
    return (
      <div className="page center">
        <div className="card">
          <h1>403 無權限</h1>
          <p className="muted">
            目前角色：{role}，需要：{roles.join(' / ')}。
          </p>
          <a className="btn" href={role === 'admin' ? '/admin' : '/staff'}>
            返回我嘅頁面
          </a>
        </div>
      </div>
    );
  }

  return children;
}
