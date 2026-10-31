import { createContext, useContext, useEffect, useState } from 'react';
import api, { tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On page load, restore the session from the saved token
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    tokenStore.set(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  // Used by signup later: store a token we already received
  function setSession(token, newUser) {
    tokenStore.set(token);
    setUser(newUser);
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setSession }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
