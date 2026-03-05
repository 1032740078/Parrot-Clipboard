import { useEffect, useState } from "react";

import { MainPanel } from "./components/MainPanel";
import { Toast } from "./components/common/Toast";
import { useUIStore } from "./stores";

function App() {
  const showPanel = useUIStore((state) => state.showPanel);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    showPanel();
  }, [showPanel]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <button
        className="absolute left-4 top-4 rounded-md bg-brand px-3 py-2 text-sm"
        onClick={() => setToastVisible(true)}
        type="button"
      >
        显示提示
      </button>

      <MainPanel />
      <Toast message="粘贴失败，请重试" onClose={() => setToastVisible(false)} visible={toastVisible} />
    </main>
  );
}

export default App;
