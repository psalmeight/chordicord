import { useAuth0 } from '@auth0/auth0-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import api, { apiError } from '@/lib/api';
import { setAccessTokenProvider, type User } from '@/lib/auth';
import { applyFont, FONTS, getFont, setStoredFont, type FontOption } from '@/lib/fonts';

interface AppContextValue {
  user: User | null;
  loading: boolean;
  /** Why the API refused to sign a valid Auth0 session in, if it did. */
  authError: string | null;
  login: (returnTo?: string) => void;
  logout: () => void;
  /** Re-asks the API who they are, e.g. after verifying their email. */
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
  font: FontOption;
  setFont: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth0 = useAuth0();
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [font, setFontState] = useState<FontOption>(getFont);

  // Applied as a CSS variable rather than through Chakra's theme so the
  // preference reaches plain elements (charts, print output) too.
  useEffect(() => {
    applyFont(font);
  }, [font]);

  // Hand the SDK's token getter to the API client before any request fires.
  useEffect(() => {
    setAccessTokenProvider(auth0.isAuthenticated ? () => auth0.getAccessTokenSilently() : null);
  }, [auth0.isAuthenticated, auth0.getAccessTokenSilently]);

  // Auth0 says who they are; /me says what they are here (role), and on a
  // first sign-in is the call that creates the account.
  useEffect(() => {
    if (auth0.isLoading) return;
    if (!auth0.isAuthenticated) {
      setUserState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<{ user: User }>('/api/auth/me')
      .then(({ data }) => {
        setUserState(data.user);
        setAuthError(null);
      })
      .catch((err) => {
        setUserState(null);
        setAuthError(apiError(err, 'Could not sign you in'));
      })
      .finally(() => setLoading(false));
  }, [auth0.isLoading, auth0.isAuthenticated]);

  const value: AppContextValue = {
    user,
    loading: auth0.isLoading || loading,
    authError: auth0.error?.message ?? authError,
    login: (returnTo = '/') => {
      auth0.loginWithRedirect({ appState: { returnTo } });
    },
    refresh: async () => {
      // A fresh token first, so the API's check with Auth0 sees an email
      // verified since this session started.
      await auth0.getAccessTokenSilently({ cacheMode: 'off' }).catch(() => undefined);
      try {
        const { data } = await api.get<{ user: User }>('/api/auth/me');
        setUserState(data.user);
        setAuthError(null);
      } catch (err) {
        setAuthError(apiError(err, 'Could not check your account'));
      }
    },
    logout: () => {
      setUserState(null);
      auth0.logout({ logoutParams: { returnTo: `${window.location.origin}/login` } });
    },
    setUser: setUserState,
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
