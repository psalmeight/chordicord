export type Role = 'admin' | 'leader' | 'member';

/** The signed-in account, as /api/auth/me returns it. Shared with the songbook. */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
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
    // The request goes out unauthenticated and the 401 handler sends them
    // back to sign in.
    return null;
  }
}

/** Only admins manage the prayer list; everyone else reads it. */
export function canManage(user: User | null): boolean {
  return user?.role === 'admin';
}
