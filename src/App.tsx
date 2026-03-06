import { useEffect } from "react";

import { MainPanel } from "./components/MainPanel";
import { Toast } from "./components/common/Toast";
import { useUIStore } from "./stores";

function App() {
  const showPanel = useUIStore((state) => state.showPanel);
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);

  useEffect(() => {
    const restorePanelVisibility = (): void => {
      showPanel();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        restorePanelVisibility();
      }
    };

    restorePanelVisibility();
    window.addEventListener("focus", restorePanelVisibility);
    window.addEventListener("pageshow", restorePanelVisibility);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", restorePanelVisibility);
      window.removeEventListener("pageshow", restorePanelVisibility);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [showPanel]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <MainPanel />
      <Toast
        duration={toast?.duration}
        level={toast?.level}
        message={toast?.message ?? ""}
        onClose={hideToast}
        visible={Boolean(toast)}
      />
    </main>
  );
}

export default App;
