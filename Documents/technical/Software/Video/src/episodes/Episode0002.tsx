import { Composition, Sequence } from "remotion";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";
import { EpisodeTitleCard } from "../shared/EpisodeTitleCard.tsx";

// AGENT NOTE: Keep episode-specific timing local so each episode can place shared sequences differently.
const EPISODE_ID = "Episode0002";
const EPISODE_TITLE = "Episode 2";
const FIRST_TITLE_FRAMES = 150;
const BRAND_SEQUENCE_FRAMES = 150;
const TOTAL_EPISODE_FRAMES = 450;

export const Episode0002 = ({ title }: EpisodeCompositionProps) => {
  return (
    <EpisodeTemplate>
      <Sequence from={0} durationInFrames={TOTAL_EPISODE_FRAMES}>
        <EpisodeTitleCard title={title} />
      </Sequence>
      <EpisodeBrandSequence from={FIRST_TITLE_FRAMES} durationInFrames={BRAND_SEQUENCE_FRAMES} />
    </EpisodeTemplate>
  );
};

export const Episode0002Composition = () => {
  return (
    <Composition
      id={EPISODE_ID}
      component={Episode0002}
      durationInFrames={TOTAL_EPISODE_FRAMES}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        episodeId: EPISODE_ID,
        title: EPISODE_TITLE,
      }}
    />
  );
};
