declare module "../../scripts/video-episode-state.mjs" {
    export function getCommandCenterStateFilePath(): string;
    export function normalizeEpisodeId(value: string): string;
    export function readCurrentEpisodeId(): Promise<string>;
    export function toEpisodeDisplayName(episodeId: string): string;
    export function writeCurrentEpisodeId(episodeId: string): Promise<void>;
}