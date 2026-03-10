import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AboutWindow } from "./components/AboutWindow";
import { PermissionGuideWindow } from "./components/PermissionGuideWindow";
import { PreviewWindow } from "./components/PreviewWindow";
import { logger, normalizeError } from "./api/logger";
import { SettingsWindowPlaceholder } from "./components/SettingsWindowPlaceholder";
import "./index.css";

declare global {
  interface Window {
    __clipboard_logger_bound__?: boolean;
  }
}

const bindGlobalErrorHandlers = (): void => {
  if (window.__clipboard_logger_bound__) {
    return;
  }

  window.__clipboard_logger_bound__ = true;

  window.addEventListener("error", (event) => {
    logger.error("前端未捕获异常", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: normalizeError(event.error),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("前端未处理 Promise 拒绝", {
      reason: normalizeError(event.reason),
    });
  });
};

const resolveRootApp = () => {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");

  if (windowType === "about" || windowType === "settings" || windowType === "preview") {
    document.body.classList.add("standalone-window");
  }

  if (windowType === "about") {
    return <AboutWindow />;
  }

  if (windowType === "settings") {
    return <SettingsWindowPlaceholder />;
  }

  if (windowType === "preview") {
    return <PreviewWindow />;
  }

  if (windowType === "permission-guide") {
    return <PermissionGuideWindow />;
  }

  return <App />;
};

bindGlobalErrorHandlers();
logger.info("前端应用启动");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{resolveRootApp()}</React.StrictMode>
);
