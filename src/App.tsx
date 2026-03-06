import { useEffect } from "react";

import { MainPanel } from "./components/MainPanel";
import { Toast } from "./components/common/Toast";
import { useUIStore } from "./stores";

function App() {
  const showPanel = useUIStore((state) => state.showPanel);
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);

  useEffect(() => {
    showPanel();
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
