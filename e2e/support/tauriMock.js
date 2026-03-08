(() => {
  const callbacks = new Map();
  const eventListeners = new Map();
  const invokeCalls = [];
  const defaultRuntimeStatus = {
    monitoring: true,
    launch_at_login: true,
    panel_visible: true,
  };
  const defaultSettingsSnapshot = {
    config_version: 2,
    general: {
      theme: "system",
      language: "zh-CN",
      launch_at_login: true,
    },
    history: {
      max_text_records: 200,
      max_image_records: 50,
      max_file_records: 100,
      max_image_storage_mb: 512,
      capture_images: true,
      capture_files: true,
    },
    shortcut: {
      toggle_panel: "shift+control+v",
      platform_default: "shift+control+v",
    },
    privacy: {
      blacklist_rules: [],
    },
  };
  const defaultPlatformCapabilities = {
    platform: "windows",
    session_type: "native",
    clipboard_monitoring: "supported",
    global_shortcut: "supported",
    launch_at_login: "supported",
    tray: "supported",
    active_app_detection: "supported",
    reasons: [],
  };
  const defaultReleaseInfo = {
    app_version: "1.0.0",
    platform: defaultPlatformCapabilities.platform,
    session_type: defaultPlatformCapabilities.session_type,
    schema_version: 2,
    config_version: 2,
    build_profile: "debug",
  };
  const defaultPermissionStatus = {
    platform: defaultPlatformCapabilities.platform,
    accessibility: "unsupported",
    checked_at: 1700000000000,
    reason: "accessibility_permission_not_applicable",
  };
  const defaultDiagnosticsSnapshot = {
    release: {
      app_version: defaultReleaseInfo.app_version,
      platform: defaultReleaseInfo.platform,
      session_type: defaultReleaseInfo.session_type,
      schema_version: defaultReleaseInfo.schema_version,
      config_version: defaultReleaseInfo.config_version,
      build_profile: defaultReleaseInfo.build_profile,
    },
    permission: {
      platform: defaultPermissionStatus.platform,
      accessibility: defaultPermissionStatus.accessibility,
      checked_at: defaultPermissionStatus.checked_at,
      reason: defaultPermissionStatus.reason,
    },
    log_directory: "/tmp/e2e-logs",
    migration: {
      current_schema_version: 2,
      migrated: false,
      recovered_from_corruption: false,
      checked_at: 1700000001000,
      backup_paths: [],
    },
    last_orphan_cleanup: null,
    capabilities: {
      platform: defaultPlatformCapabilities.platform,
      session_type: defaultPlatformCapabilities.session_type,
      clipboard_monitoring: defaultPlatformCapabilities.clipboard_monitoring,
      global_shortcut: defaultPlatformCapabilities.global_shortcut,
      launch_at_login: defaultPlatformCapabilities.launch_at_login,
      tray: defaultPlatformCapabilities.tray,
      active_app_detection: defaultPlatformCapabilities.active_app_detection,
      reasons: [...defaultPlatformCapabilities.reasons],
    },
  };
  const defaultUpdateCheckResult = {
    status: "latest",
    checked_at: 1700000002000,
    current_version: defaultReleaseInfo.app_version,
    latest_version: defaultReleaseInfo.app_version,
    release_notes_url: null,
    download_url: null,
    message: "当前已是最新版本",
  };
  const defaultOrphanCleanupSummary = {
    deleted_original_files: 0,
    deleted_thumbnail_files: 0,
    executed_at: 1700000003000,
  };

  let nextCallbackId = 1;
  let nextEventId = 1;
  let records = Array.isArray(globalThis.window.__E2E_INITIAL_RECORDS__)
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_INITIAL_RECORDS__))
    : [];
  let runtimeStatus = globalThis.window.__E2E_RUNTIME_STATUS__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_RUNTIME_STATUS__))
    : JSON.parse(JSON.stringify(defaultRuntimeStatus));
  let settingsSnapshot = globalThis.window.__E2E_INITIAL_SETTINGS__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_INITIAL_SETTINGS__))
    : JSON.parse(JSON.stringify(defaultSettingsSnapshot));
  let platformCapabilities = globalThis.window.__E2E_PLATFORM_CAPABILITIES__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_PLATFORM_CAPABILITIES__))
    : JSON.parse(JSON.stringify(defaultPlatformCapabilities));
  let releaseInfo = globalThis.window.__E2E_RELEASE_INFO__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_RELEASE_INFO__))
    : JSON.parse(JSON.stringify(defaultReleaseInfo));
  let permissionStatus = globalThis.window.__E2E_PERMISSION_STATUS__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_PERMISSION_STATUS__))
    : JSON.parse(JSON.stringify(defaultPermissionStatus));
  let diagnosticsSnapshot = globalThis.window.__E2E_DIAGNOSTICS_SNAPSHOT__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_DIAGNOSTICS_SNAPSHOT__))
    : JSON.parse(JSON.stringify(defaultDiagnosticsSnapshot));
  let updateCheckResult = globalThis.window.__E2E_UPDATE_CHECK_RESULT__
    ? JSON.parse(JSON.stringify(globalThis.window.__E2E_UPDATE_CHECK_RESULT__))
    : JSON.parse(JSON.stringify(defaultUpdateCheckResult));
  let orphanCleanupSummary =
    typeof globalThis.window.__E2E_ORPHAN_CLEANUP_SUMMARY__ !== "undefined"
      ? JSON.parse(JSON.stringify(globalThis.window.__E2E_ORPHAN_CLEANUP_SUMMARY__))
      : JSON.parse(JSON.stringify(defaultOrphanCleanupSummary));

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const convertFileSrc = (filePath, protocol = 'asset') => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return '';
    }

    if (/^(data:|blob:|https?:|\/)/.test(filePath)) {
      return filePath;
    }

    const encodedPath = encodeURIComponent(filePath);
    return platformCapabilities.platform === 'windows'
      ? `http://${protocol}.localhost/${encodedPath}`
      : `${protocol}://localhost/${encodedPath}`;
  };
  const sortRecords = (items) =>
    [...items].sort((left, right) => {
      const timeDelta =
        (right.last_used_at ?? right.created_at) - (left.last_used_at ?? left.created_at);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return right.id - left.id;
    });
  const normalizeIdentifier = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const normalizeShortcut = (shortcut) =>
    String(shortcut ?? "")
      .split("+")
      .map((token) => {
        const normalized = token.trim().toLowerCase();
        switch (normalized) {
          case "ctrl":
          case "control":
            return "control";
          case "cmd":
          case "command":
          case "meta":
            return "super";
          default:
            return normalized;
        }
      })
      .filter(Boolean)
      .join("+");
  const createShortcutValidation = (shortcut, overrides = {}) => ({
    normalized_shortcut: normalizeShortcut(shortcut),
    valid: true,
    conflict: false,
    reason: null,
    ...overrides,
  });
  const syncRuntimeStatus = (patch) => {
    runtimeStatus = {
      ...runtimeStatus,
      ...clone(patch),
    };
  };
  const setSettingsSnapshot = (nextSnapshot) => {
    settingsSnapshot = {
      ...clone(defaultSettingsSnapshot),
      ...clone(nextSnapshot),
      general: {
        ...clone(defaultSettingsSnapshot.general),
        ...(clone(nextSnapshot?.general) ?? {}),
      },
      history: {
        ...clone(defaultSettingsSnapshot.history),
        ...(clone(nextSnapshot?.history) ?? {}),
      },
      shortcut: {
        ...clone(defaultSettingsSnapshot.shortcut),
        ...(clone(nextSnapshot?.shortcut) ?? {}),
      },
      privacy: {
        ...clone(defaultSettingsSnapshot.privacy),
        ...(clone(nextSnapshot?.privacy) ?? {}),
      },
    };
    syncRuntimeStatus({ launch_at_login: settingsSnapshot.general.launch_at_login });
  };
  const setPlatformCapabilities = (nextCapabilities) => {
    platformCapabilities = {
      ...clone(defaultPlatformCapabilities),
      ...(clone(nextCapabilities) ?? {}),
    };
    releaseInfo = {
      ...releaseInfo,
      platform: platformCapabilities.platform,
      session_type: platformCapabilities.session_type,
    };
    permissionStatus = {
      ...permissionStatus,
      platform: platformCapabilities.platform,
    };
    diagnosticsSnapshot = {
      ...diagnosticsSnapshot,
      release: clone(releaseInfo),
      permission: clone(permissionStatus),
      capabilities: clone(platformCapabilities),
    };
  };
  const setReleaseInfo = (nextReleaseInfo) => {
    releaseInfo = {
      ...clone(defaultReleaseInfo),
      ...(clone(nextReleaseInfo) ?? {}),
    };
    diagnosticsSnapshot = {
      ...diagnosticsSnapshot,
      release: clone(releaseInfo),
    };
  };
  const setPermissionStatus = (nextPermissionStatus) => {
    permissionStatus = {
      ...clone(defaultPermissionStatus),
      ...(clone(nextPermissionStatus) ?? {}),
    };
    diagnosticsSnapshot = {
      ...diagnosticsSnapshot,
      permission: clone(permissionStatus),
    };
  };
  const setDiagnosticsSnapshot = (nextDiagnosticsSnapshot) => {
    diagnosticsSnapshot = {
      ...clone(defaultDiagnosticsSnapshot),
      ...(clone(nextDiagnosticsSnapshot) ?? {}),
      release: {
        ...clone(defaultDiagnosticsSnapshot.release),
        ...(clone(nextDiagnosticsSnapshot?.release) ?? {}),
      },
      permission: {
        ...clone(defaultDiagnosticsSnapshot.permission),
        ...(clone(nextDiagnosticsSnapshot?.permission) ?? {}),
      },
      migration: {
        ...clone(defaultDiagnosticsSnapshot.migration),
        ...(clone(nextDiagnosticsSnapshot?.migration) ?? {}),
      },
      capabilities: {
        ...clone(defaultDiagnosticsSnapshot.capabilities),
        ...(clone(nextDiagnosticsSnapshot?.capabilities) ?? {}),
      },
    };
    releaseInfo = clone(diagnosticsSnapshot.release);
    permissionStatus = clone(diagnosticsSnapshot.permission);
    platformCapabilities = clone(diagnosticsSnapshot.capabilities);
  };
  const setUpdateCheckResult = (nextUpdateCheckResult) => {
    updateCheckResult = {
      ...clone(defaultUpdateCheckResult),
      ...(clone(nextUpdateCheckResult) ?? {}),
    };
  };
  const setOrphanCleanupSummary = (nextSummary) => {
    const summary = clone(nextSummary);
    orphanCleanupSummary = summary
      ? {
          ...clone(defaultOrphanCleanupSummary),
          ...summary,
        }
      : clone(defaultOrphanCleanupSummary);
  };
  const upsertRecord = (record) => {
    records = sortRecords([record, ...records.filter((item) => item.id !== record.id)]);
  };
  const removeRecord = (id) => {
    records = records.filter((record) => record.id !== id);
  };
  const activeApplicationIdentifier = (activeApplication, matchType) => {
    if (!activeApplication) {
      return "";
    }
    switch (matchType) {
      case "bundle_id":
        return activeApplication.bundle_id;
      case "process_name":
        return activeApplication.process_name;
      case "app_id":
        return activeApplication.app_id;
      case "wm_class":
        return activeApplication.wm_class;
      default:
        return "";
    }
  };
  const matchesBlacklist = (activeApplication) =>
    settingsSnapshot.privacy.blacklist_rules.some(
      (rule) =>
        rule.enabled &&
        rule.platform === activeApplication?.platform &&
        normalizeIdentifier(activeApplicationIdentifier(activeApplication, rule.match_type)) ===
          normalizeIdentifier(rule.app_identifier)
    );

  const applyEventSideEffects = (event, payload) => {
    if (
      event === "system:monitoring-changed" &&
      payload &&
      typeof payload.monitoring === "boolean"
    ) {
      syncRuntimeStatus({ monitoring: payload.monitoring });
    }

    if (event === "clipboard:history-cleared") {
      records = [];
    }

    if (event === "system:clear-history-requested") {
      syncRuntimeStatus({ panel_visible: true });
    }

    if (
      event === "system:panel-visibility-changed" &&
      payload &&
      typeof payload.panel_visible === "boolean"
    ) {
      syncRuntimeStatus({ panel_visible: payload.panel_visible });
    }

    if (event === "system:settings-updated" && payload) {
      setSettingsSnapshot(payload);
    }

    if (
      event === "system:launch-at-login-changed" &&
      payload &&
      typeof payload.launch_at_login === "boolean"
    ) {
      syncRuntimeStatus({ launch_at_login: payload.launch_at_login });
    }

    if (event === "system:diagnostics-updated" && payload) {
      setDiagnosticsSnapshot(payload);
    }
  };

  const resetState = () => {
    records = [];
    runtimeStatus = clone(defaultRuntimeStatus);
    settingsSnapshot = clone(defaultSettingsSnapshot);
    platformCapabilities = clone(defaultPlatformCapabilities);
    releaseInfo = clone(defaultReleaseInfo);
    permissionStatus = clone(defaultPermissionStatus);
    diagnosticsSnapshot = clone(defaultDiagnosticsSnapshot);
    updateCheckResult = clone(defaultUpdateCheckResult);
    orphanCleanupSummary = clone(defaultOrphanCleanupSummary);
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

  const simulateClipboardCapture = ({ activeApplication, record }) => {
    if (matchesBlacklist(activeApplication)) {
      return { skipped: true, reason: "blacklist" };
    }

    upsertRecord(record);
    return { skipped: false, count: records.length };
  };

  records = sortRecords(records);
  setSettingsSnapshot(settingsSnapshot);
  setPlatformCapabilities(platformCapabilities);
  setReleaseInfo(releaseInfo);
  setPermissionStatus(permissionStatus);
  setDiagnosticsSnapshot(diagnosticsSnapshot);
  setUpdateCheckResult(updateCheckResult);
  setOrphanCleanupSummary(orphanCleanupSummary);

  globalThis.window.__E2E_TAURI__ = {
    reset: resetState,
    setRecords(nextRecords) {
      records = sortRecords(clone(nextRecords) ?? []);
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
    setSettingsSnapshot,
    getSettingsSnapshot() {
      return clone(settingsSnapshot);
    },
    setPlatformCapabilities,
    getPlatformCapabilities() {
      return clone(platformCapabilities);
    },
    setReleaseInfo,
    getReleaseInfo() {
      return clone(releaseInfo);
    },
    setPermissionStatus,
    getPermissionStatus() {
      return clone(permissionStatus);
    },
    setDiagnosticsSnapshot,
    getDiagnosticsSnapshot() {
      return clone(diagnosticsSnapshot);
    },
    setUpdateCheckResult,
    getUpdateCheckResult() {
      return clone(updateCheckResult);
    },
    setOrphanCleanupSummary,
    getOrphanCleanupSummary() {
      return clone(orphanCleanupSummary);
    },
    getInvokeCalls() {
      return clone(invokeCalls);
    },
    emitEvent,
    simulateClipboardCapture,
  };

  const windowType = new globalThis.URLSearchParams(globalThis.window.location.search).get(
    "window"
  );
  const windowLabel =
    windowType === "settings" ? "settings" : windowType === "about" ? "about" : "main";

  globalThis.window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: windowLabel },
      currentWebview: { label: windowLabel },
    },
    convertFileSrc,
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

      if (command === "get_record_detail") {
        const record = records.find((item) => item.id === args?.id);
        if (!record) {
          throw { code: "RECORD_NOT_FOUND", message: "missing" };
        }

        return clone({
          ...record,
          text_content:
            typeof record.text_content === "string"
              ? record.text_content
              : record.content_type === "text"
                ? record.preview_text
                : null,
          rich_content: record.rich_content ?? null,
          image_detail: record.content_type === "image" ? record.image_detail ?? null : null,
          files_detail: record.content_type === "files" ? record.files_detail ?? null : null,
        });
      }

      if (command === "get_settings_snapshot") {
        return clone(settingsSnapshot);
      }

      if (command === "get_platform_capabilities") {
        return clone(platformCapabilities);
      }

      if (command === "update_general_settings") {
        settingsSnapshot = {
          ...settingsSnapshot,
          general: {
            theme: args?.theme ?? settingsSnapshot.general.theme,
            language: args?.language ?? settingsSnapshot.general.language,
            launch_at_login: Boolean(
              args?.launch_at_login ?? settingsSnapshot.general.launch_at_login
            ),
          },
        };
        syncRuntimeStatus({ launch_at_login: settingsSnapshot.general.launch_at_login });
        return clone(settingsSnapshot);
      }

      if (command === "update_history_settings") {
        settingsSnapshot = {
          ...settingsSnapshot,
          history: {
            max_text_records: Number(
              args?.max_text_records ?? settingsSnapshot.history.max_text_records
            ),
            max_image_records: Number(
              args?.max_image_records ?? settingsSnapshot.history.max_image_records
            ),
            max_file_records: Number(
              args?.max_file_records ?? settingsSnapshot.history.max_file_records
            ),
            max_image_storage_mb: Number(
              args?.max_image_storage_mb ?? settingsSnapshot.history.max_image_storage_mb
            ),
            capture_images: Boolean(
              args?.capture_images ?? settingsSnapshot.history.capture_images
            ),
            capture_files: Boolean(args?.capture_files ?? settingsSnapshot.history.capture_files),
          },
        };
        return clone(settingsSnapshot);
      }

      if (command === "validate_toggle_shortcut") {
        if (platformCapabilities.global_shortcut !== "supported") {
          return createShortcutValidation(args?.shortcut ?? "", {
            valid: false,
            conflict: false,
            reason: "当前会话不支持全局快捷键，请改用托盘菜单打开主面板",
          });
        }

        const normalizedShortcut = normalizeShortcut(args?.shortcut ?? "");
        const hasModifier = ["shift", "control", "alt", "super"].some((token) =>
          normalizedShortcut.split("+").includes(token)
        );
        if (!hasModifier) {
          return createShortcutValidation(args?.shortcut ?? "", {
            valid: false,
            conflict: false,
            reason: "快捷键至少需要一个修饰键",
          });
        }

        const reserved =
          platformCapabilities.platform === "macos"
            ? ["super+space", "super+tab", "super+shift+4"]
            : ["alt+tab", "control+alt+delete", "super+space"];
        if (reserved.includes(normalizedShortcut)) {
          return createShortcutValidation(args?.shortcut ?? "", {
            valid: true,
            conflict: true,
            reason: "当前组合键与系统保留快捷键冲突，请改用其他组合",
          });
        }

        return createShortcutValidation(args?.shortcut ?? "");
      }

      if (command === "update_toggle_shortcut") {
        settingsSnapshot = {
          ...settingsSnapshot,
          shortcut: {
            ...settingsSnapshot.shortcut,
            toggle_panel: normalizeShortcut(
              args?.shortcut ?? settingsSnapshot.shortcut.toggle_panel
            ),
          },
        };
        return clone(settingsSnapshot);
      }

      if (command === "create_blacklist_rule") {
        const normalizedIdentifier = normalizeIdentifier(args?.app_identifier);
        const duplicated = settingsSnapshot.privacy.blacklist_rules.some(
          (rule) =>
            rule.platform === args?.platform &&
            rule.match_type === args?.match_type &&
            normalizeIdentifier(rule.app_identifier) === normalizedIdentifier
        );
        if (duplicated) {
          throw { code: "INVALID_PARAM", message: "同一平台与匹配类型下已存在相同应用标识" };
        }

        settingsSnapshot = {
          ...settingsSnapshot,
          privacy: {
            blacklist_rules: [
              ...settingsSnapshot.privacy.blacklist_rules,
              {
                id: `rule-${settingsSnapshot.privacy.blacklist_rules.length + 1}`,
                app_name: String(args?.app_name ?? ""),
                platform: args?.platform,
                match_type: args?.match_type,
                app_identifier: normalizedIdentifier,
                enabled: true,
                created_at: 1700000000000,
                updated_at: 1700000000000,
              },
            ],
          },
        };
        return clone(settingsSnapshot);
      }

      if (command === "update_blacklist_rule") {
        settingsSnapshot = {
          ...settingsSnapshot,
          privacy: {
            blacklist_rules: settingsSnapshot.privacy.blacklist_rules.map((rule) =>
              rule.id === args?.id
                ? {
                    ...rule,
                    app_name: String(args?.app_name ?? rule.app_name),
                    platform: args?.platform ?? rule.platform,
                    match_type: args?.match_type ?? rule.match_type,
                    app_identifier: normalizeIdentifier(
                      args?.app_identifier ?? rule.app_identifier
                    ),
                    enabled: Boolean(args?.enabled),
                    updated_at: 1700000001000,
                  }
                : rule
            ),
          },
        };
        return clone(settingsSnapshot);
      }

      if (command === "delete_blacklist_rule") {
        settingsSnapshot = {
          ...settingsSnapshot,
          privacy: {
            blacklist_rules: settingsSnapshot.privacy.blacklist_rules.filter(
              (rule) => rule.id !== args?.id
            ),
          },
        };
        return clone(settingsSnapshot);
      }

      if (command === "get_release_info") {
        return clone(releaseInfo);
      }

      if (command === "get_diagnostics_snapshot") {
        return clone(diagnosticsSnapshot);
      }

      if (command === "get_permission_status") {
        return clone(permissionStatus);
      }

      if (command === "open_accessibility_settings") {
        return null;
      }

      if (command === "check_app_update") {
        emitEvent("system:update-check-finished", clone(updateCheckResult));
        return clone(updateCheckResult);
      }

      if (command === "run_orphan_cleanup") {
        const cleanupResult = {
          ...(clone(orphanCleanupSummary) ?? clone(defaultOrphanCleanupSummary)),
          executed_at: Date.now(),
        };
        orphanCleanupSummary = clone(cleanupResult);
        diagnosticsSnapshot = {
          ...diagnosticsSnapshot,
          last_orphan_cleanup: clone(cleanupResult),
        };
        emitEvent("system:diagnostics-updated", clone(diagnosticsSnapshot));
        return clone(cleanupResult);
      }

      if (command === "show_about_window") {
        return null;
      }

      if (command === "show_settings_window") {
        return null;
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
        emitEvent("system:panel-visibility-changed", {
          panel_visible: false,
          reason: args?.reason ?? "escape",
        });
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
