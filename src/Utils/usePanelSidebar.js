import { useCallback, useEffect, useState } from "react";

export function usePanelSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const resize = event => setSidebarOpen(event.matches);
    const escape = event => { if (event.key === "Escape") setSidebarOpen(false); };
    media.addEventListener("change", resize);
    window.addEventListener("keydown", escape);
    return () => { media.removeEventListener("change", resize); window.removeEventListener("keydown", escape); };
  }, []);
  const toggleSidebar = useCallback(() => setSidebarOpen(value => !value), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeOnMobile = useCallback(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(false);
  }, []);
  return { sidebarOpen, toggleSidebar, closeSidebar, closeOnMobile };
}
