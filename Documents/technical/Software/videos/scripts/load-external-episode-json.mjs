import { readFileSync } from "node:fs";
import path from "node:path";

export default function loadExternalEpisodeJson(source) {
	const pointerFile = JSON.parse(source.toString());
	let episode = pointerFile;

	if (Object.keys(pointerFile).length === 1 && typeof pointerFile.sourceFile === "string") {
		const sourceFile = path.resolve(path.dirname(this.resourcePath), pointerFile.sourceFile);
		this.addDependency(sourceFile);

		try {
			episode = JSON.parse(readFileSync(sourceFile, "utf8"));
		} catch (error) {
			throw new Error(
				`Unable to load episode source ${sourceFile} referenced by ${this.resourcePath}: ${error.message}`,
			);
		}
	}

	return `export default ${JSON.stringify(episode)};`;
}