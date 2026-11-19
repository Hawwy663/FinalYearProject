import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext({
  user: null,
  role: null,
  profile: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      // 每次 auth 狀態改變都要先當「載入中」，否則 role 未讀完就會被當成 null，
      // 令管理員一登入就彈去員工頁。
      setLoading(true);
      setUser(nextUser);
      setProfile(null);

      if (nextUser) {
        try {
          const snap = await getDoc(doc(db, 'users', nextUser.uid));
          setProfile(snap.exists() ? snap.data() : null);
        } catch (err) {
          console.error('讀取使用者角色失敗', err);
          setProfile(null);
        }
      }
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      logout: () => signOut(auth),
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
