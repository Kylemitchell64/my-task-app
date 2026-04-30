import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem("jwt");
    if (stored && !isTokenExpired(stored)) return stored;
    localStorage.removeItem("jwt");
    return null;
  });

  const login = useCallback((newToken) => {
    localStorage.setItem("jwt", newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("jwt");
    setToken(null);
  }, []);

  const user = token ? parseJwt(token) : null;

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
