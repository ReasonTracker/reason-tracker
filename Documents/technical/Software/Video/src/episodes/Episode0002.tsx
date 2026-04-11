import { Sequence } from "remotion";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";
import { EpisodeTitleCard } from "../shared/EpisodeTitleCard.tsx";

// AGENT NOTE: Keep episode-specific timing local so each episode can place shared sequences differently.
const FIRST_TITLE_FRAMES = 150;
const BRAND_SEQUENCE_FRAMES = 150;
const TOTAL_EPISODE_FRAMES = 450;

export const Episode0002 = ({ title }: EpisodeCompositionProps) => {
  return (
    <EpisodeTemplate>
      <Sequence from={0} durationInFrames={TOTAL_EPISODE_FRAMES}>
        <EpisodeTitleCard title={title} />
      </Sequence>
      <Sequence from={FIRST_TITLE_FRAMES} durationInFrames={BRAND_SEQUENCE_FRAMES}>
        <EpisodeBrandSequence />
      </Sequence>
    </EpisodeTemplate>
  );
};