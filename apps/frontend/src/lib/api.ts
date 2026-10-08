import axios, { type AxiosResponse } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Standard unwrap for the backend's envelope: `{ data: … }` with an optional
 * second nesting (`{ data: { data: … } }` on paginated responses). Prefer this
 * over inline `r.data?.data ?? r.data` chains — it's typed and consistent.
 */
export function unwrap<T = any>(r: AxiosResponse): T {
  return (r.data?.data ?? r.data) as T;
}

// Request interceptor - attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 with token refresh
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const response = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        const { accessToken } = response.data.data;
        useAuthStore.getState().setAccessToken(accessToken);
        refreshQueue.forEach(({ resolve }) => resolve(accessToken));
        refreshQueue = [];
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        refreshQueue.forEach(({ reject }) => reject(refreshError));
        refreshQueue = [];
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
