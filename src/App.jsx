import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import RequireRole from './components/RequireRole';
import Loading from './components/Loading';
import Login from './pages/Login';
import StaffHome from './pages/StaffHome';
import AdminDashboard from './pages/AdminDashboard';
import RecordDetail from './pages/RecordDetail';
import PrintNotice from './pages/PrintNotice';
import QrPrint from './pages/QrPrint';

function HomeRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return <Loading label="載入中…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/staff'} replace />;
}

function NotFound() {
  return (
    <div className="page center">
      <h1>404</h1>
      <p className="muted">搵唔到呢一頁。</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/staff"
            element={
              <RequireRole roles={['staff', 'admin']}>
                <StaffHome />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole roles={['admin']}>
                <AdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin/qr"
            element={
              <RequireRole roles={['admin']}>
                <QrPrint />
              </RequireRole>
            }
          />
          <Route
            path="/admin/records/:id"
            element={
              <RequireRole roles={['admin']}>
                <RecordDetail />
              </RequireRole>
            }
          />
          <Route
            path="/admin/records/:id/notice"
            element={
              <RequireRole roles={['admin']}>
                <PrintNotice />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
