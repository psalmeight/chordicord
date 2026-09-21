import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Auth0 wiring. Sits inside the router so that coming back from the hosted
 * login page can land on the route the person originally asked for.
 *
 * Tokens are refresh-token based and cached in localStorage: the silent
 * iframe fallback is blocked by Safari and by any browser with third-party
 * cookies off, which is most of a phone-heavy band.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const onRedirectCallback = (appState?: AppState) => {
    navigate(appState?.returnTo || '/', { replace: true });
  };

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        // email + profile are what the API reads from /userinfo to create
        // the account on first sign-in.
        scope: 'openid profile email',
      }}
      useRefreshTokens
      cacheLocation="localstorage"
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}
