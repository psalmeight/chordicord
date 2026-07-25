import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { clearAuth, getCachedUser, getToken, setAuth, setCachedUser, type User } from '@/lib/auth';
import { applyFont, FONTS, getFont, setStoredFont, type FontOption } from '@/lib/fonts';

interface AppContextValue {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  font: FontOption;
  setFont: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Start from the cached user so the shell renders immediately, then
  // revalidate — role changes take effect without a re-login.
  const [user, setUserState] = useState<User | null>(getCachedUser);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [font, setFontState] = useState<FontOption>(getFont);

  // Applied as a CSS variable rather than through Chakra's theme so the
  // preference reaches plain elements (charts, print output) too.
  useEffect(() => {
    applyFont(font);
  }, [font]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/api/auth/me')
      .then(({ data }) => {
        setUserState(data.user);
        setCachedUser(data.user);
      })
      .catch(() => {
        // A 401 is already handled by the interceptor; anything else we
        // ride out on the cached user.
      })
      .finally(() => setLoading(false));
  }, []);

  const value: AppContextValue = {
    user,
    loading,
    login: (token, u) => {
      setAuth(token, u);
      setUserState(u);
    },
    logout: () => {
      clearAuth();
      setUserState(null);
      window.location.href = '/login';
    },
    setUser: (u) => {
      setCachedUser(u);
      setUserState(u);
    },
    font,
    setFont: (id) => {
      const next = FONTS.find((f) => f.id === id);
      if (!next) return;
      setStoredFont(next.id);
      setFontState(next);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
