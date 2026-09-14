import { readFileSync } from "node:fs";
import path from "node:path";

export default function loadExternalEpisodeJson(source) {
	const pointerFile = JSON.parse(source.toString());
	let episode = pointerFile;
	let episodeFile = this.resourcePath;

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
		episodeFile = sourceFile;
	}

	const mediaAspectRatios = resolveMediaAspectRatios(
		episode,
		path.dirname(episodeFile),
		(sourceFile) => this.addDependency(sourceFile),
	);
	return `export default { ...${JSON.stringify(episode)}, __mediaAspectRatios: ${JSON.stringify(mediaAspectRatios)} };`;
}

function resolveMediaAspectRatios(episode, episodeDirectory, addDependency) {
	const mediaSources = new Set(
		Array.isArray(episode.script)
			? episode.script
				.filter((action) => (action?.type === "media.add" || action?.type === "media.update") && typeof action.source === "string")
				.map((action) => action.source)
			: [],
	);
	return Object.fromEntries([...mediaSources].map((source) => {
		const sourceFile = path.resolve(episodeDirectory, source);
		addDependency(sourceFile);
		const { height, width } = readImageDimensions(readFileSync(sourceFile), sourceFile);
		return [source, width / height];
	}));
}

function readImageDimensions(file, sourceFile) {
	const extension = path.extname(sourceFile).toLowerCase();
	if (extension === ".png" && file.subarray(1, 4).toString("ascii") === "PNG") {
		return { height: file.readUInt32BE(20), width: file.readUInt32BE(16) };
	}
	if (extension === ".gif" && file.subarray(0, 3).toString("ascii") === "GIF") {
		return { height: file.readUInt16LE(8), width: file.readUInt16LE(6) };
	}
	if (extension === ".jpg" || extension === ".jpeg") {
		return readJpegDimensions(file, sourceFile);
	}
	if (extension === ".webp") {
		return readWebpDimensions(file, sourceFile);
	}
	if (extension === ".avif") {
		return readAvifDimensions(file, sourceFile);
	}
	throw new Error(`Unable to determine media dimensions for ${sourceFile}: unsupported or invalid image format.`);
}

function readJpegDimensions(file, sourceFile) {
	for (let offset = 2; offset + 9 < file.length;) {
		if (file[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = file[offset + 1];
		const length = file.readUInt16BE(offset + 2);
		if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
			return { height: file.readUInt16BE(offset + 5), width: file.readUInt16BE(offset + 7) };
		}
		if (length < 2) {
			break;
		}
		offset += length + 2;
	}
	throw new Error(`Unable to determine media dimensions for ${sourceFile}: JPEG has no supported frame header.`);
}

function readWebpDimensions(file, sourceFile) {
	for (let offset = 12; offset + 8 <= file.length;) {
		const type = file.subarray(offset, offset + 4).toString("ascii");
		const length = file.readUInt32LE(offset + 4);
		const data = offset + 8;
		if (type === "VP8X" && data + 10 <= file.length) {
			return { height: readUInt24LE(file, data + 7) + 1, width: readUInt24LE(file, data + 4) + 1 };
		}
		if (type === "VP8L" && data + 5 <= file.length && file[data] === 0x2f) {
			const bits = file.readUInt32LE(data + 1);
			return { height: ((bits >> 14) & 0x3fff) + 1, width: (bits & 0x3fff) + 1 };
		}
		if (type === "VP8 " && data + 10 <= file.length) {
			return { height: file.readUInt16LE(data + 8) & 0x3fff, width: file.readUInt16LE(data + 6) & 0x3fff };
		}
		offset = data + length + (length % 2);
	}
	throw new Error(`Unable to determine media dimensions for ${sourceFile}: WebP has no supported frame header.`);
}

function readAvifDimensions(file, sourceFile) {
	const ispe = file.indexOf(Buffer.from("ispe"));
	if (ispe >= 0 && ispe + 16 <= file.length) {
		return { height: file.readUInt32BE(ispe + 12), width: file.readUInt32BE(ispe + 8) };
	}
	throw new Error(`Unable to determine media dimensions for ${sourceFile}: AVIF has no image spatial extent.`);
}

function readUInt24LE(file, offset) {
	return file[offset] | (file[offset + 1] << 8) | (file[offset + 2] << 16);
}