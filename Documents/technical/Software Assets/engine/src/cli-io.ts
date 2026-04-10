import type {
    CalculateDebateCliRequest,
    CycleHandlingMode,
    CliFailure,
    CliRequest,
} from "@reasontracker/contracts";
import { runCli } from "./cli.ts";

export interface CliIoResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export function runCliFromArgv(argv: string[], stdinText: string): CliIoResult {
    const command = argv[0];
    if (!command) {
        return {
            exitCode: 2,
            stdout: "",
            stderr: "Missing command. Supported commands: calculateDebate",
        };
    }

    const parsed = parseRequest(command, stdinText);
    if (!parsed.ok) {
        return {
            exitCode: 2,
            stdout: JSON.stringify(parsed.failure),
            stderr: parsed.failure.error.message,
        };
    }

    const response = runCli(parsed.request);
    return {
        exitCode: response.ok ? 0 : 1,
        stdout: JSON.stringify(response),
        stderr: response.ok ? "" : response.error.message,
    };
}

export async function runCliFromProcess(
    argv: string[] = process.argv.slice(2),
): Promise<number> {
    const stdinText = await readStdin();
    const result = runCliFromArgv(argv, stdinText);

    if (result.stdout.length > 0) {
        process.stdout.write(`${result.stdout}\n`);
    }
    if (result.stderr.length > 0) {
        process.stderr.write(`${result.stderr}\n`);
    }

    return result.exitCode;
}

function parseRequest(
    command: string,
    stdinText: string,
):
    | { ok: true; request: CliRequest }
    | { ok: false; failure: CliFailure } {
    let payload: unknown;
    try {
        payload = stdinText.trim().length > 0 ? JSON.parse(stdinText) : {};
    } catch {
        return {
            ok: false,
            failure: invalidRequest(command, "Invalid JSON on stdin."),
        };
    }

    if (command !== "calculateDebate") {
        return {
            ok: false,
            failure: invalidRequest(command, `Unknown command: ${command}`),
        };
    }

    if (!payload || typeof payload !== "object" || !("debate" in payload)) {
        return {
            ok: false,
            failure: invalidRequest(command, "Request body must be an object with a debate field."),
        };
    }

    const cycleHandling = (payload as { cycleHandling?: unknown }).cycleHandling;
    if (
        cycleHandling !== undefined &&
        cycleHandling !== "fail" &&
        cycleHandling !== "cut" &&
        cycleHandling !== "simulateAllSingleCuts"
    ) {
        return {
            ok: false,
            failure: invalidRequest(
                command,
                "cycleHandling must be one of: fail, cut, simulateAllSingleCuts.",
            ),
        };
    }

    const request: CalculateDebateCliRequest = {
        command: "calculateDebate",
        debate: (payload as { debate: CalculateDebateCliRequest["debate"] }).debate,
        cycleHandling: cycleHandling as CycleHandlingMode | undefined,
    };

    return {
        ok: true,
        request,
    };
}

function invalidRequest(command: string, message: string): CliFailure {
    return {
        ok: false,
        command: (command as CliFailure["command"]) ?? "calculateDebate",
        error: {
            code: "INVALID_REQUEST",
            message,
        },
    };
}

async function readStdin(): Promise<string> {
    let data = "";
    for await (const chunk of process.stdin) {
        data += String(chunk);
    }
    return data;
}