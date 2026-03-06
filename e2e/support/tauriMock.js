(() => {
  const callbacks = new Map();
  const eventListeners = new Map();
  const invokeCalls = [];
  const defaultRuntimeStatus = {
    monitoring: true,
    launch_at_login: true,
    panel_visible: true,
  };

  let nextCallbackId = 1;
  let nextEventId = 1;
  let records = Array.isArray(globalThis.window.__E2E_INITIAL_RECORDS__)
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_INITIAL_RECORDS__))
    : [];
  let runtimeStatus = globalThis.window.__E2E_RUNTIME_STATUS__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_RUNTIME_STATUS__))
    : JSON.parse(JSON.stringify(defaultRuntimeStatus));

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const sortRecords = (items) =>
    [...items].sort((left, right) => {
      const timeDelta = (right.last_used_at ?? right.created_at) - (left.last_used_at ?? left.created_at);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return right.id - left.id;
    });

  const syncRuntimeStatus = (patch) => {
    runtimeStatus = {
      ...runtimeStatus,
      ...clone(patch),
    };
  };

  const upsertRecord = (record) => {
    records = sortRecords([record, ...records.filter((item) => item.id !== record.id)]);
  };

  const removeRecord = (id) => {
    records = records.filter((record) => record.id !== id);
  };

  const applyEventSideEffects = (event, payload) => {
    if (event === "system:monitoring-changed" && payload && typeof payload.monitoring === "boolean") {
      syncRuntimeStatus({ monitoring: payload.monitoring });
    }

    if (event === "clipboard:history-cleared") {
      records = [];
    }

    if (event === "system:clear-history-requested") {
      syncRuntimeStatus({ panel_visible: true });
    }
  };

  const resetState = () => {
    records = [];
    runtimeStatus = clone(defaultRuntimeStatus);
    invokeCalls.splice(0, invokeCalls.length);
    eventListeners.clear();
  };

  const emitEvent = (event, payload) => {
    applyEventSideEffects(event, payload);

    const listeners = eventListeners.get(event) ?? [];
    listeners.forEach((listener) => {
      const callback = callbacks.get(listener.handler);
      if (callback) {
        callback({ event, id: listener.eventId, payload: clone(payload) });
      }
    });
  };

  records = sortRecords(records);

  globalThis.window.__E2E_TAURI__ = {
    reset: resetState,
    setRecords(nextRecords) {
      records = sortRecords(clone(nextRecords));
    },
    getRecords() {
      return clone(records);
    },
    setRuntimeStatus(nextStatus) {
      syncRuntimeStatus(nextStatus);
    },
    getRuntimeStatus() {
      return clone(runtimeStatus);
    },
    getInvokeCalls() {
      return clone(invokeCalls);
    },
    emitEvent,
  };

  globalThis.window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
    transformCallback(callback) {
      const id = nextCallbackId;
      nextCallbackId += 1;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    runCallback(id, payload) {
      const callback = callbacks.get(id);
      if (callback) {
        callback(payload);
      }
    },
    async invoke(command, args) {
      invokeCalls.push({ command, args: clone(args) });

      if (command === "plugin:event|listen") {
        const eventId = nextEventId;
        nextEventId += 1;
        const listeners = eventListeners.get(args.event) ?? [];
        listeners.push({ eventId, handler: args.handler });
        eventListeners.set(args.event, listeners);
        return eventId;
      }

      if (command === "plugin:event|unlisten") {
        const listeners = eventListeners.get(args.event) ?? [];
        eventListeners.set(
          args.event,
          listeners.filter((listener) => listener.eventId !== args.eventId)
        );
        return null;
      }

      if (command === "get_records") {
        return clone(records.slice(0, args?.limit ?? 20));
      }

      if (command === "paste_record") {
        const record = records.find((item) => item.id === args.id);
        if (!record) {
          throw { code: "RECORD_NOT_FOUND", message: "missing" };
        }
        if (args.mode === "plain_text" && record.content_type !== "text") {
          throw { code: "INVALID_PARAM", message: "invalid" };
        }
        const promoted = {
          ...record,
          last_used_at: Date.now(),
        };
        upsertRecord(promoted);
        return {
          record: clone(promoted),
          paste_mode: args.mode ?? "original",
          executed_at: Date.now(),
        };
      }

      if (command === "delete_record") {
        removeRecord(args.id);
        return null;
      }

      if (command === "hide_panel") {
        syncRuntimeStatus({ panel_visible: false });
        return null;
      }

      if (command === "get_monitoring_status") {
        return { monitoring: runtimeStatus.monitoring };
      }

      if (command === "get_runtime_status") {
        return clone(runtimeStatus);
      }

      if (command === "clear_history") {
        if (args?.confirm_token !== "confirm-clear-history-v0.3") {
          throw { code: "INVALID_PARAM", message: "invalid confirm token" };
        }

        const result = {
          deleted_records: records.length,
          deleted_image_assets: records.filter((record) => record.content_type === "image").length,
          executed_at: Date.now(),
        };

        records = [];
        emitEvent("clipboard:history-cleared", result);
        return result;
      }

      if (command === "get_log_directory") {
        return "/tmp/e2e-logs";
      }

      if (command === "write_client_log") {
        return null;
      }

      throw { code: "WINDOW_ERROR", message: `unknown command: ${command}` };
    },
  };
})();
