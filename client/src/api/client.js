import axios from 'axios';

const TOKEN_KEY = 'subflow_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({ baseURL: '/api' });

// Attach the login token to every request
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the session expired, log out and go to the login page
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Turn any API error into a readable message
export function errorMessage(err) {
  return err?.response?.data?.error || err?.message || 'Something went wrong';
}

export default api;
