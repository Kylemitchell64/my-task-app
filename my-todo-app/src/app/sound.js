// A short two-note chime for the end of a focus session, made with Web Audio so there is
// no sound file to download.

let context = null;

/** Call from a click or key press. Browsers only allow sound after a user gesture. */
export function unlockSound() {
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") context.resume();
  } catch {
    context = null;
  }
}

export function playChime() {
  if (!context || context.state !== "running") return;
  const start = context.currentTime + 0.02;
  [
    [659.25, 0],
    [880, 0.18],
    [1318.5, 0.36],
  ].forEach(([frequency, offset]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.9);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 1);
  });
}

/** Shows a system notification if the user has allowed them. Never throws. */
export async function notify(title, body) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const options = { body, icon: "/icon-192.png", tag: "focus-finished" };
    const registration = await navigator.serviceWorker?.getRegistration();
    // Mobile browsers only allow notifications through the service worker.
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // Notifications are a nicety. The in-app message still appears.
  }
}
