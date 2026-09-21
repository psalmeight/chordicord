import axios from 'axios';
import { getAccessToken } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8082',
});

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      // The SDK refreshes tokens on its own, so a 401 means the session is
      // really gone. Don't bounce off the login page itself.
      if (!window.location.pathname.startsWith('/login')) {
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
