export type Role = 'admin' | 'leader' | 'member';

export interface User {
  id: string;
  email: string;
  /** Optional handle; null for accounts that never set one. */
  username: string | null;
  name: string;
  role: Role;
  verifiedAt: string | null;
  /** False for an account from before Auth0 whose owner hasn't signed in since. */
  linked: boolean;
}

/**
 * Where the API client gets its bearer token. Auth0's SDK only hands tokens
 * out through a hook, so the provider registers this once it has one and
 * the axios interceptor pulls from it per request. Null until then.
 */
type TokenProvider = () => Promise<string | undefined>;

let accessTokenProvider: TokenProvider | null = null;

export function setAccessTokenProvider(fn: TokenProvider | null) {
  accessTokenProvider = fn;
}

export async function getAccessToken(): Promise<string | null> {
  if (!accessTokenProvider) return null;
  try {
    return (await accessTokenProvider()) ?? null;
  } catch {
    // Consent required, refresh token gone, etc. — the request goes out
    // unauthenticated and the 401 handler sends them back to sign in.
    return null;
  }
}

/** Leaders and admins can create and edit songs; members are read-only. */
export function canEdit(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'leader';
}
