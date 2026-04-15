import "../../website/site/css/brand.css";
import "./style.css";

type CommandResponse = {
	commandId: string;
	message: string;
};

type LogEntry = {
	commandId: string;
	message: string;
	type: string;
	timestamp: string;
};

const logStorageKey = "reason-tracker-command-center-log-entries";
const maxLogEntries = 100;
const studioAlreadyRunningPrefix = "Remotion Studio is already running at ";
const messageLogElement = document.querySelector<HTMLDivElement>("#message-log");
const lastMessageAtElement = document.querySelector<HTMLDivElement>("#last-message-at");
const commandButtons = document.querySelectorAll<HTMLButtonElement>("[data-command]");
const clearLogButton = document.querySelector<HTMLButtonElement>("#clear-log");

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function formatLogTime(timestamp: string) {
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function readPersistedLogEntries() {
	try {
		const stored = localStorage.getItem(logStorageKey);
		if (!stored) {
			return [] as LogEntry[];
		}

		const parsed = JSON.parse(stored) as unknown;
		if (!Array.isArray(parsed)) {
			return [] as LogEntry[];
		}

		return parsed
			.filter((entry): entry is LogEntry => {
				return typeof entry === "object" &&
					entry !== null &&
					typeof entry.commandId === "string" &&
					typeof entry.message === "string" &&
					typeof entry.type === "string" &&
					typeof entry.timestamp === "string";
			})
			.slice(-maxLogEntries);
	} catch {
		return [] as LogEntry[];
	}
}

function writePersistedLogEntries(entries: LogEntry[]) {
	localStorage.setItem(logStorageKey, JSON.stringify(entries.slice(-maxLogEntries)));
}

function trimRenderedLogEntries() {
	if (!messageLogElement) {
		return;
	}

	while (messageLogElement.children.length > maxLogEntries) {
		messageLogElement.firstElementChild?.remove();
	}
}

function updateLastMessageAt(timestamp?: string) {
	if (!lastMessageAtElement) {
		return;
	}

	lastMessageAtElement.textContent = timestamp ? `Last Message at ${formatLogTime(timestamp)}` : "";
}

function createLogEntryHtml(entry: LogEntry) {
	const escapedMessage = escapeHtml(entry.message);
	if (entry.message.trim().length === 0) {
		return `<div class="message"><div>&nbsp;</div></div>`;
	}

	return `<div class="message"><div>${escapedMessage}</div><div class="message-time">${escapeHtml(formatLogTime(entry.timestamp))}</div></div>`;
}

function appendLogEntry(entry: LogEntry, options?: { persist?: boolean }) {
	if (!messageLogElement) {
		return;
	}

	if (options?.persist !== false) {
		const entries = readPersistedLogEntries();
		entries.push(entry);
		writePersistedLogEntries(entries);
	}

	const distanceFromBottom =
		messageLogElement.scrollHeight -
		messageLogElement.scrollTop -
		messageLogElement.clientHeight;
	const wasAtBottom = distanceFromBottom <= 8;

	messageLogElement.insertAdjacentHTML(
		"beforeend",
		createLogEntryHtml(entry),
	);
	trimRenderedLogEntries();
	updateLastMessageAt(entry.timestamp);

	if (wasAtBottom) {
		messageLogElement.scrollTop = messageLogElement.scrollHeight;
	}
}

function appendClientMessage(commandId: string, type: string, message: string) {
	appendLogEntry({
		commandId,
		message,
		timestamp: new Date().toISOString(),
		type,
	});
}

async function runCommand(command: string) {
	try {
		const response = await fetch("/api/command", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ command }),
		});

		const data = (await response.json()) as CommandResponse;
		appendClientMessage(data.commandId, "client", data.message);
		openCommandStream(data.commandId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		appendClientMessage("client", "error", message);
	}
}

function openCommandStream(commandId: string) {
	const eventSource = new EventSource(`/api/command-stream?commandId=${encodeURIComponent(commandId)}`);

	eventSource.onmessage = (event) => {
		const entry = JSON.parse(event.data) as LogEntry;

		appendLogEntry(entry);

		if (entry.message.startsWith(studioAlreadyRunningPrefix)) {
			const studioUrl = entry.message.slice(studioAlreadyRunningPrefix.length).replace(/\.$/, "");
			window.open(studioUrl, "_blank", "noopener,noreferrer");
			appendClientMessage(commandId, "client", "Opened Studio in a new browser tab.");
		}

		if (entry.type === "complete" || entry.type === "error") {
			eventSource.close();
			return;
		}
	};

	eventSource.onerror = () => {
		appendClientMessage(commandId, "error", "Command stream disconnected.");
		eventSource.close();
	};

	appendClientMessage(commandId, "client", "Listening for command updates.");
}

clearLogButton?.addEventListener("click", () => {
	if (!messageLogElement) {
		return;
	}

	messageLogElement.textContent = "";
 	localStorage.removeItem(logStorageKey);
	updateLastMessageAt();
}
);

const persistedEntries = readPersistedLogEntries();

for (const entry of persistedEntries) {
	appendLogEntry(entry, { persist: false });
}

updateLastMessageAt(persistedEntries.at(-1)?.timestamp);

for (const button of commandButtons) {
	button.addEventListener("click", () => {
		const command = button.dataset.command;
		if (!command) {
			return;
		}

		void runCommand(command);
	});
}