import { runCliFromProcess } from "./cli-io.ts";

const exitCode = await runCliFromProcess();
process.exit(exitCode);
