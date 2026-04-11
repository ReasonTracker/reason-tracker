export type EpisodeId = "Episode0001" | "Episode0002";

export function toEpisodeDisplayName(episodeId: string): string {
  const matched = /^Episode(\d+)$/.exec(episodeId);

  if (!matched) {
    return episodeId;
  }

  return `Episode ${Number.parseInt(matched[1], 10)}`;
}

export type EpisodeCompositionProps = {
  episodeId: EpisodeId;
  title: string;
};