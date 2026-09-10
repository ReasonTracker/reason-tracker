declare module "*.css";

interface WebpackRequireContext {
	(key: string): unknown;
	keys(): string[];
}

declare namespace NodeJS {
	interface Require {
		context(directory: string, useSubdirectories: boolean, regExp: RegExp): WebpackRequireContext;
	}
}