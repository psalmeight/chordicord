import axios from 'axios';
import { clearAuth, getToken } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8082',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      // Don't bounce off the login page itself, or off the invite flow —
      // neither has a valid token yet by definition.
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/invite')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** Pulls the server's error message out of an axios error. */
export function apiError(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message || fallback;
  }
  return fallback;
}

export default api;
