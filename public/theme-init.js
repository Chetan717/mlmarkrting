try {
  const theme = localStorage.getItem("mlm_theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);
} catch (_) {
  document.documentElement.setAttribute("data-theme", "dark");
}
