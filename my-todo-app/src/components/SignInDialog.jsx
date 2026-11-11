import { useEffect, useState } from "react";
import { auth } from "../app/services.js";
import Modal from "./Modal.jsx";
import { GitHubIcon, GoogleIcon } from "./icons.jsx";

const PROVIDER_ICONS = { Google: GoogleIcon, GitHub: GitHubIcon };

/**
 * Signing in is optional, so this dialog's job is to say what it adds (sync) and make
 * clear nothing is lost by doing it later.
 */
export default function SignInDialog({ onClose, onDevSignIn, returning }) {
  // Until the server answers, assume the usual two providers so the buttons never jump.
  const [options, setOptions] = useState({ providers: ["Google", "GitHub"], devLogin: false, loaded: false });
  const [going, setGoing] = useState(null);
  const [devEmail, setDevEmail] = useState("dev@example.com");
  const [devError, setDevError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // This request also wakes the server, so it is ready by the time a button is pressed.
    auth.providers().then(
      (result) => {
        if (!cancelled) setOptions({ providers: result.providers ?? [], devLogin: Boolean(result.devLogin), loaded: true });
      },
      () => {
        if (!cancelled) setOptions((current) => ({ ...current, loaded: false }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function devSignIn(event) {
    event.preventDefault();
    setDevError(null);
    setGoing("dev");
    try {
      await onDevSignIn(devEmail.trim());
    } catch (error) {
      setDevError(error.message);
      setGoing(null);
    }
  }

  return (
    <Modal title={returning ? "Sign in again" : "Sync across your devices"} onClose={onClose} size="small" testId="signin-dialog">
      <div className="modal__body signin">
        <p>
          {returning
            ? "Your session ended. Sign in again to keep syncing. Everything you changed in the meantime is still here and will be sent."
            : "Sign in to back up your tasks and see them on every device. The tasks already here come with you."}
        </p>

        <div className="signin__buttons">
          {options.providers.map((provider) => {
            const ProviderIcon = PROVIDER_ICONS[provider];
            return (
              <a
                key={provider}
                className="btn btn--outline btn--large"
                href={auth.loginUrl(provider)}
                onClick={() => setGoing(provider)}
                aria-busy={going === provider}
                data-testid={`signin-${provider.toLowerCase()}`}
              >
                {ProviderIcon && <ProviderIcon size={18} />}
                {going === provider ? "Connecting…" : `Continue with ${provider}`}
              </a>
            );
          })}
          {options.loaded && options.providers.length === 0 && !options.devLogin && (
            <p className="signin__note">Sign-in is not set up on this server.</p>
          )}
        </div>

        {going && going !== "dev" && (
          <p className="signin__note" role="status">
            If the sync server was asleep it can take up to a minute to wake. This page will move on by itself.
          </p>
        )}

        {options.devLogin && (
          <form className="signin__dev" onSubmit={devSignIn}>
            <label htmlFor="dev-email">Development sign-in (no password)</label>
            <div className="field__row">
              <input
                id="dev-email"
                type="email"
                required
                value={devEmail}
                onChange={(event) => setDevEmail(event.target.value)}
                data-testid="dev-email"
              />
              <button type="submit" className="btn btn--primary" disabled={going === "dev"} data-testid="dev-signin">
                {going === "dev" ? "Signing in…" : "Sign in"}
              </button>
            </div>
            {devError && (
              <p className="signin__error" role="alert">
                {devError}
              </p>
            )}
          </form>
        )}

        <p className="signin__fineprint">
          No password to remember. Only your name, email and picture are read from the provider, and you can delete your account
          and its data at any time in Settings.
        </p>
      </div>
    </Modal>
  );
}
