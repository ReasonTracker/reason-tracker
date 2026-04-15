import path from "node:path";
import { defineConfig, type ViteDevServer } from "vite";

const commandCenterDir = path.resolve(import.meta.dirname);
const watchedServerDir = `${toPosixPath(path.join(commandCenterDir, "server"))}/`;
const watchedBackendPaths = [path.join(commandCenterDir, "server")];

export default defineConfig({
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  plugins: [commandCenterApiPlugin()],
});

function commandCenterApiPlugin() {
  let backendVersion = Date.now();
  const commandStreams = new Map<string, Set<import("node:http").ServerResponse>>();

  const broadcast = (commandId: string, payload: { commandId: string; message: string; timestamp: string; type: string }) => {
    const listeners = commandStreams.get(commandId);
    if (!listeners) {
      return;
    }

    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const listener of listeners) {
      listener.write(line);
    }

    if (payload.type === "complete" || payload.type === "error") {
      for (const listener of listeners) {
        listener.end();
      }
      commandStreams.delete(commandId);
    }
  };

  return {
    name: "command-center-api",
    configureServer(server: ViteDevServer) {
      server.watcher.add(watchedBackendPaths);

      const bumpBackendVersion = (changedPath: string) => {
        const normalized = toPosixPath(changedPath);
        if (!normalized.startsWith(watchedServerDir) && !normalized.endsWith("/scripts/video-episode-state.mjs")) {
          return;
        }

        backendVersion = Date.now();
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", bumpBackendVersion);
      server.watcher.on("change", bumpBackendVersion);
      server.watcher.on("unlink", bumpBackendVersion);

      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (!requestUrl.pathname.startsWith("/api/")) {
          next();
          return;
        }

        try {
          const core = await loadBackendModule(server, backendVersion);

          if (request.method === "GET" && requestUrl.pathname === "/api/command-stream") {
            const commandId = requestUrl.searchParams.get("commandId");
            if (!commandId) {
              await writeText(response, 400, "Missing commandId.");
              return;
            }

            response.statusCode = 200;
            response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            response.setHeader("Cache-Control", "no-cache, no-transform");
            response.setHeader("Connection", "keep-alive");
            response.write("\n");

            const listeners = commandStreams.get(commandId) ?? new Set();
            listeners.add(response);
            commandStreams.set(commandId, listeners);

            request.on("close", () => {
              const currentListeners = commandStreams.get(commandId);
              if (!currentListeners) {
                return;
              }

              currentListeners.delete(response);
              if (currentListeners.size === 0) {
                commandStreams.delete(commandId);
              }
            });

            return;
          }

          if (request.method === "POST" && requestUrl.pathname === "/api/command") {
            const requestBody = await readJsonBody(request);
            const commandId = createCommandId();

            void core.runCommand(requestBody, {
              commandId,
              report(message: string, type = "update") {
                broadcast(commandId, {
                  commandId,
                  message,
                  timestamp: new Date().toISOString(),
                  type,
                });
              },
            });

            await writeJson(response, 200, {
              commandId,
              message: `Started ${requestBody.command}.`,
            });
            return;
          }

          await writeText(response, 404, "Not found.");
        } catch (error) {
          await writeText(response, 500, toErrorMessage(error));
        }
      });
    },
  };
}

async function loadBackendModule(server: ViteDevServer, version: number) {
  return server.ssrLoadModule(`/server/core.ts?t=${version}`);
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as { command: string };
}

async function writeJson(response: Parameters<ViteDevServer["middlewares"]["use"]>[0] extends never ? never : import("node:http").ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

async function writeText(response: Parameters<ViteDevServer["middlewares"]["use"]>[0] extends never ? never : import("node:http").ServerResponse, status: number, value: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(`${value}\n`);
}

function toPosixPath(value: string) {
  return value.replaceAll("\\", "/");
}

function createCommandId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
