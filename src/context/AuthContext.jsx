import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { authAPI, setAccessToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        // The access token only lives in memory, so after a page reload the session is restored
        // from the httpOnly refresh cookie, which returns a fresh access token and the user.
        const response = await authAPI.refresh();
        const { accessToken: token, user: userData } = response.data.data;
        setAccessToken(token);
        setAccessTokenState(token);
        setUser(userData);
      } catch (error) {
        setUser(null);
        setAccessTokenState(null);
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener('auth:logout', () => {
      setUser(null);
      setAccessTokenState(null);
      setAccessToken(null);
    });

    restoreSession();
  }, []);

  const signup = useCallback(async ({ fullName, email, password, purpose }) => {
    const response = await authAPI.signup({ fullName, email, password, purpose });
    return response.data;
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await authAPI.login({ email, password });
    const { accessToken, user: userData } = response.data.data;
    setAccessToken(accessToken);
    setAccessTokenState(accessToken);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    await authAPI.logout();
    setUser(null);
    setAccessTokenState(null);
    setAccessToken(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      signup,
      login,
      logout,
      loading
    }),
    [user, accessToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}