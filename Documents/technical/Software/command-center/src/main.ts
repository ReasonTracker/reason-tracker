import "./style.css";

type CommandCategory = "preview" | "video" | "test" | "build" | "utilities";

type CommandRecord = {
  category: CommandCategory;
  description: string;
  displayName: string;
  isBackground: boolean;
  packageName: string;
  scriptKey: string;
  source: string;
  slug: string;
  triggerCommand: string;
};

type VideoRecord = {
  episodeId: string;
  episodeNumber: number;
  label: string;
  relativePath: string;
};

type HomePayload = {
  commands: CommandRecord[];
  currentEpisodeId: string;
  currentEpisodeLabel: string;
  packageSummaries: Array<{ commandCount: number; packageName: string; summary: string }>;
  recentVideos: VideoRecord[];
};

type VideoPayload = {
  commands: CommandRecord[];
  currentEpisodeId: string;
  currentEpisodeLabel: string;
  recentVideos: VideoRecord[];
};

type ActionPayload = {
  body?: string;
  mode?: string;
  output?: string;
  status?: number;
  title: string;
};

type AppData =
  | { kind: "home"; payload: HomePayload }
  | { kind: "video"; payload: VideoPayload };

type FlashState = {
  kind: "error" | "success";
  message: string;
} | null;

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("#app was not found.");
}

const state = {
  appData: null as AppData | null,
  busyKey: "" as string,
  flash: null as FlashState,
  result: null as ActionPayload | null,
};

void bootstrap();

async function bootstrap() {
  renderLoading();
  installNavigationHandlers();
  await loadRoute();
}

function installNavigationHandlers() {
  window.addEventListener("popstate", () => {
    void loadRoute();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("[data-nav]");
    if (!link) {
      return;
    }

    const href = link.getAttribute("href");
    if (!href) {
      return;
    }

    event.preventDefault();
    window.history.pushState({}, "", href);
    void loadRoute();
  });
}

async function loadRoute() {
  state.flash = null;
  state.result = null;

  try {
    const route = getRouteKind();
    if (route === "video") {
      state.appData = {
        kind: "video",
        payload: await requestJson<VideoPayload>("/api/video"),
      };
    } else {
      state.appData = {
        kind: "home",
        payload: await requestJson<HomePayload>("/api/home"),
      };
    }
  } catch (error) {
    state.appData = null;
    state.flash = {
      kind: "error",
      message: toErrorMessage(error),
    };
  }

  renderApp();
}

function getRouteKind() {
  return window.location.pathname === "/video" ? "video" : "home";
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

function renderLoading() {
  appElement.innerHTML = '<div class="loading">Loading Command Center</div>';
}

function renderApp() {
  if (!state.appData) {
    appElement.innerHTML = `<div class="shell">${renderFlash()}</div>`;
    return;
  }

  const nav = renderNav();
  const flash = renderFlash();
  const result = renderResult();
  const content = state.appData.kind === "home" ? renderHome(state.appData.payload) : renderVideo(state.appData.payload);
  appElement.innerHTML = `<div class="shell">${nav}${flash}${result}${content}</div>`;
  bindActionHandlers();
}

function renderNav() {
  const onVideo = state.appData?.kind === "video";
  return `<section class="panel"><div class="panel-inner"><div class="eyebrow">Navigation</div><div class="nav-row"><a class="nav-link" data-nav href="/">Command Center</a><a class="nav-link" data-nav href="/video" aria-current="${onVideo ? "page" : "false"}">Video</a></div></div></section>`;
}

function renderFlash() {
  if (!state.flash) {
    return "";
  }

  return `<section class="status-banner ${state.flash.kind}"><div class="status-label">${state.flash.kind}</div><p>${escapeHtml(state.flash.message)}</p></section>`;
}

function renderResult() {
  if (!state.result) {
    return "";
  }

  const details = state.result.output
    ? `<pre>${escapeHtml(state.result.output)}</pre>`
    : state.result.body ?? "";

  return `<section class="panel"><div class="panel-inner"><div class="eyebrow">Latest Result</div><h3>${escapeHtml(state.result.title)}</h3>${state.result.status === undefined ? "" : `<p>Status: ${state.result.status}</p>`}${state.result.mode ? `<p>Mode: ${escapeHtml(state.result.mode)}</p>` : ""}${details}</div></section>`;
}

function renderHome(payload: HomePayload) {
  const grouped = groupCommands(payload.commands);
  return `
    <section class="panel hero-panel">
      <div class="panel-inner">
        <div class="eyebrow">Software Command Center</div>
        <h1><span class="brand-pro">Reason</span> <span class="brand-con">Tracker</span> Operations</h1>
        <p class="shell-copy">The workspace home for dev servers, tests, publishing, and video workflows.</p>
        <div class="hero-grid">
          <div class="hero-spotlight">
            <div class="label">Current Video</div>
            <div class="big-value">${escapeHtml(payload.currentEpisodeLabel)}</div>
            <div class="muted">${escapeHtml(payload.currentEpisodeId)}</div>
            <div class="actions-row">
              <button class="button" data-action="video-render-current">Render Current</button>
              <button class="button alt" data-action="video-open-studio">Open Studio</button>
              <a class="button ghost" data-nav href="/video">Open Video Page</a>
            </div>
          </div>
          <div class="hero-side">
            <div class="label">Recent Videos</div>
            <ul class="video-list">${payload.recentVideos.map((video) => `<li><strong>${escapeHtml(video.label)}</strong><span>${escapeHtml(video.episodeId)}</span></li>`).join("")}</ul>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-inner">
        <div class="section-topline">Packages</div>
        <div class="package-grid">${payload.packageSummaries.map((item) => `<article class="package-card"><div class="card-topline">Package</div><h3>${escapeHtml(item.packageName)}</h3><p>${escapeHtml(item.summary)}</p><div class="meta-row"><span>${item.commandCount} commands</span></div></article>`).join("")}</div>
      </div>
    </section>
    ${renderCommandSections(grouped)}
  `;
}

function renderVideo(payload: VideoPayload) {
  return `
    <section class="panel hero-panel">
      <div class="panel-inner">
        <div class="eyebrow">Video Workspace</div>
        <h1><span class="brand-pro">${escapeHtml(payload.currentEpisodeLabel)}</span></h1>
        <p class="shell-copy">Focused video operations inside the command center.</p>
        <div class="hero-grid">
          <div class="spotlight">
            <h2>Current Episode</h2>
            <div class="current-value">${escapeHtml(payload.currentEpisodeLabel)}</div>
            <p>${escapeHtml(payload.currentEpisodeId)}</p>
            <div class="actions-row">
              <button class="button" data-action="video-render-current">Render Current</button>
              <button class="button alt" data-action="video-open-studio">Open Studio</button>
            </div>
          </div>
          <div class="spotlight">
            <h2>Navigation</h2>
            <p>Stay here for episode switching and video-only commands.</p>
            <div class="actions-row"><a class="button ghost" data-nav href="/">Back To Command Center</a></div>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-inner">
        <div class="section-topline">Recent Videos</div>
        <div class="episode-grid">${payload.recentVideos.map((video) => `<article class="episode-card"><div class="card-topline">Episode</div><h3>${escapeHtml(video.label)}</h3><p>${escapeHtml(video.episodeId)} lives in ${escapeHtml(video.relativePath)}.</p><div class="meta-row"><span>${video.episodeNumber}</span></div><div class="actions-row"><button class="button ghost" data-action="video-set-current" data-episode-id="${escapeHtml(video.episodeId)}">Make Current</button><button class="button" data-action="video-render" data-episode-id="${escapeHtml(video.episodeId)}">Render</button></div></article>`).join("")}</div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-inner">
        <div class="section-topline">Video Commands</div>
        <div class="command-grid">${payload.commands.map(renderCommandCard).join("")}</div>
      </div>
    </section>
  `;
}

function renderCommandSections(grouped: Map<string, CommandRecord[]>) {
  const order: CommandCategory[] = ["preview", "video", "test", "build", "utilities"];
  const titles = new Map<CommandCategory, string>([
    ["preview", "Preview And Dev"],
    ["video", "Video"],
    ["test", "Testing"],
    ["build", "Build And Publish"],
    ["utilities", "Utilities"],
  ]);

  return order
    .filter((key) => grouped.has(key))
    .map((key) => `<section class="panel"><div class="panel-inner"><div class="section-topline">${escapeHtml(titles.get(key) ?? key)}</div><div class="command-grid">${grouped.get(key)?.map(renderCommandCard).join("") ?? ""}</div></div></section>`)
    .join("");
}

function renderCommandCard(command: CommandRecord) {
  const runLabel = command.isBackground ? "Start" : "Run";
  const modeLabel = command.isBackground ? "Background" : "One-shot";
  return `<article class="command-card"><div class="card-topline">${escapeHtml(command.packageName)}</div><h3>${escapeHtml(command.displayName)}</h3><p>${escapeHtml(command.description)}</p><code>${escapeHtml(command.triggerCommand)}</code><div class="meta-row"><span>${modeLabel}</span><span>${escapeHtml(command.source)}</span></div><div class="actions-row"><button class="button" data-action="run-command" data-command-slug="${escapeHtml(command.slug)}">${runLabel}</button></div></article>`;
}

function bindActionHandlers() {
  for (const element of document.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    element.disabled = state.busyKey.length > 0;
    element.addEventListener("click", async () => {
      const action = element.dataset.action ?? "";
      const episodeId = element.dataset.episodeId ?? "";
      const slug = element.dataset.commandSlug ?? "";
      await runAction(action, episodeId, slug);
    });
  }
}

async function runAction(action: string, episodeId: string, slug: string) {
  state.busyKey = [action, episodeId, slug].join(":");
  state.flash = null;
  renderApp();

  try {
    if (action === "video-set-current") {
      await requestJson<{ ok: true }>(`/api/video/current/${encodeURIComponent(episodeId)}`, { method: "POST" });
      state.flash = { kind: "success", message: `Current episode set to ${episodeId}.` };
      await loadRoute();
      return;
    }

    if (action === "video-render-current") {
      state.result = await requestJson<ActionPayload>("/api/video/render-current", { method: "POST" });
    } else if (action === "video-open-studio") {
      state.result = await requestJson<ActionPayload>("/api/video/open-studio", { method: "POST" });
    } else if (action === "video-render") {
      state.result = await requestJson<ActionPayload>(`/api/video/render/${encodeURIComponent(episodeId)}`, { method: "POST" });
    } else if (action === "run-command") {
      state.result = await requestJson<ActionPayload>(`/api/run/${slug}`, { method: "POST" });
    }
  } catch (error) {
    state.flash = { kind: "error", message: toErrorMessage(error) };
  } finally {
    state.busyKey = "";
    renderApp();
  }
}

function groupCommands(commands: CommandRecord[]) {
  const grouped = new Map<string, CommandRecord[]>();

  for (const command of commands) {
    const key = command.category;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(command);
      continue;
    }

    grouped.set(key, [command]);
  }

  return grouped;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
