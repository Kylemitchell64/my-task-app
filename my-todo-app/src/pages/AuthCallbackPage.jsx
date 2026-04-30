import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1)); // strip leading #
    const token = params.get("token");

    if (token) {
      login(token);
      navigate("/", { replace: true });
    } else {
      navigate("/login?error=no_token", { replace: true });
    }
  }, [login, navigate]);

  return (
    <div className="App">
      <div className="login-container">
        <p className="login-subtitle">Signing you in…</p>
      </div>
    </div>
  );
}
