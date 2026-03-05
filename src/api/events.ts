import { listen } from "@tauri-apps/api/event";

import type { NewRecordPayload, RecordDeletedPayload } from "./types";

export const onNewRecord = async (
  handler: (payload: NewRecordPayload) => void
): Promise<() => void> => {
  return listen<NewRecordPayload>("clipboard:new-record", (event) => {
    handler(event.payload);
  });
};

export const onRecordDeleted = async (
  handler: (payload: RecordDeletedPayload) => void
): Promise<() => void> => {
  return listen<RecordDeletedPayload>("clipboard:record-deleted", (event) => {
    handler(event.payload);
  });
};
