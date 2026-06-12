import { useState, useCallback } from 'react';
import { login as apiLogin, clearToken, getToken } from '../api/client';

export function useAuth() {
  const [token, setToken] = useState(getToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isAuthenticated = !!token;

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiLogin(username, password);
      setToken(data.token);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
  }, []);

  return { isAuthenticated, token, loading, error, login, logout };
}
