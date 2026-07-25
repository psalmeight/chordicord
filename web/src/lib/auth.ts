export type Role = 'admin' | 'leader' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  verifiedAt: string | null;
}

const TOKEN_KEY = 'transcode_token';
const USER_KEY = 'transcode_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCachedUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setCachedUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Leaders and admins can create and edit songs; members are read-only. */
export function canEdit(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'leader';
}
