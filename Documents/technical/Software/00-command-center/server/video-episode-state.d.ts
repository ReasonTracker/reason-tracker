declare module "../../scripts/video-episode-state.mts" {
    export function getCommandCenterStateFilePath(): string;
    export function normalizeEpisodeId(value: string): string | null;
    export function readCurrentEpisodeId(): Promise<string>;
    export function toEpisodeDisplayName(episodeId: string): string;
    export function writeCurrentEpisodeId(episodeId: string): Promise<{ currentEpisodeId: string }>;
}