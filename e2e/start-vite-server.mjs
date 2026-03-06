import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const nodeProcess = globalThis.process;

const server = await createServer({
  root: rootDir,
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();

const shutdown = async () => {
  await server.close();
  nodeProcess.exit(0);
};

nodeProcess.on("SIGINT", shutdown);
nodeProcess.on("SIGTERM", shutdown);
