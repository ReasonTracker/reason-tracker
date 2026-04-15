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

const studioAlreadyRunningPrefix = "Remotion Studio is already running at ";
const messageLogElement = document.querySelector<HTMLDivElement>("#message-log");
const commandButtons = document.querySelectorAll<HTMLButtonElement>("[data-command]");
const clearLogButton = document.querySelector<HTMLButtonElement>("#clear-log");

function appendLogEntry(entry: LogEntry) {
	if (!messageLogElement) {
		return;
	}

	const item = document.createElement("div");
	item.className = "log-entry";
	item.textContent = JSON.stringify(entry);
	messageLogElement.append(item);
	messageLogElement.scrollTop = messageLogElement.scrollHeight;
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
	}
);

for (const button of commandButtons) {
	button.addEventListener("click", () => {
		const command = button.dataset.command;
		if (!command) {
			return;
		}

		void runCommand(command);
	});
}