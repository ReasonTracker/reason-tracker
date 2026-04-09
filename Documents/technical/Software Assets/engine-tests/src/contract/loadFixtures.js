import fs from "node:fs";
import path from "node:path";

function readJsonFile(filePath) {
	const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
	const parsed = JSON.parse(raw);
	if (Array.isArray(parsed)) {
		return parsed;
	}
	if (Array.isArray(parsed.cases)) {
		return parsed.cases;
	}
	return [parsed];
}

function readJsonLines(filePath) {
	const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));

	return lines.map((line) => JSON.parse(line));
}

export function loadFixtures(fixturesDir) {
	const dirEntries = fs.readdirSync(fixturesDir, { withFileTypes: true });
	const fixtureFiles = dirEntries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => (name.endsWith(".json") || name.endsWith(".jsonl")) && !name.endsWith(".schema.json"));

	const allCases = [];

	for (const fileName of fixtureFiles) {
		const filePath = path.join(fixturesDir, fileName);
		const fileCases = fileName.endsWith(".jsonl") ? readJsonLines(filePath) : readJsonFile(filePath);

		for (const fixtureCase of fileCases) {
			allCases.push({
				...fixtureCase,
				_source: fileName
			});
		}
	}

	return allCases;
}
