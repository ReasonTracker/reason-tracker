import path from "node:path";
import { defineConfig, type ViteDevServer } from "vite";

const commandCenterDir = path.resolve(import.meta.dirname);
const backendEntryPath = path.join(commandCenterDir, "server", "core.ts");
const watchedBackendPaths = [
  path.join(commandCenterDir, "server"),
  path.join(commandCenterDir, "src"),
  path.join(commandCenterDir, "..", "scripts", "video-episode-state.mjs"),
];

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

  return {
    name: "command-center-api",
    configureServer(server: ViteDevServer) {
      server.watcher.add(watchedBackendPaths);

      const bumpBackendVersion = (changedPath: string) => {
        const normalized = toPosixPath(changedPath);
        if (!normalized.includes("/command-center/server/") && !normalized.endsWith("/scripts/video-episode-state.mjs")) {
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

          if (request.method === "GET" && requestUrl.pathname === "/api/home") {
            await writeJson(response, 200, await core.getHomePayload());
            return;
          }

          if (request.method === "GET" && requestUrl.pathname === "/api/video") {
            await writeJson(response, 200, await core.getVideoPayload());
            return;
          }

          if (request.method === "POST" && requestUrl.pathname.startsWith("/api/video/current/")) {
            const episodeId = decodeURIComponent(requestUrl.pathname.slice("/api/video/current/".length));
            await writeJson(response, 200, await core.setCurrentEpisode(episodeId));
            return;
          }

          if (request.method === "POST" && requestUrl.pathname === "/api/video/render-current") {
            await writeJson(response, 200, await core.runCurrentEpisodeRender());
            return;
          }

          if (request.method === "POST" && requestUrl.pathname.startsWith("/api/video/render/")) {
            const episodeId = decodeURIComponent(requestUrl.pathname.slice("/api/video/render/".length));
            await writeJson(response, 200, await core.runEpisodeRender(episodeId));
            return;
          }

          if (request.method === "POST" && requestUrl.pathname === "/api/video/open-studio") {
            await writeJson(response, 200, await core.openStudio());
            return;
          }

          if (request.method === "POST" && requestUrl.pathname.startsWith("/api/run/")) {
            const slug = requestUrl.pathname.slice("/api/run/".length);
            await writeJson(response, 200, await core.runNamedCommand(slug));
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
