// Runs before the app loads. Kept tiny and dependency-free on purpose.
(function () {
  var theme = "system";
  try {
    theme = JSON.parse(localStorage.getItem("lt.prefs.v1") || "{}").theme || "system";
  } catch {
    // Fall back to the system setting.
  }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
})();
