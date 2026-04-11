import { Composition } from "remotion";
import type { ClaimId } from "@reasontracker/contracts";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import { episode0001Debate } from "./Episode0001/graphData.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { CameraMove, GraphView } from "../shared/GraphView.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";

const EPISODE_ID = "Episode0001";
const EPISODE_TITLE = "Episode 1";
const TOTAL_EPISODE_FRAMES = 300;

const zoomMotionOptions = {
  durationInFrames: 50,
  padding: 200,
};

export const Episode0001 = (_props: EpisodeCompositionProps) => {
  return (
    <EpisodeTemplate>
      <GraphView debate={episode0001Debate}>
        <CameraMove
        {...zoomMotionOptions}
          from={30}
          claimId={"main" as ClaimId}
        />
        <CameraMove
          from={100}
          claimId={"b" as ClaimId}
        {...zoomMotionOptions}
        />
        <CameraMove
          from={190}
          claimId={"a" as ClaimId}
        {...zoomMotionOptions}
        />
        <CameraMove
          from={250}
          durationInFrames={50}
          reset
        />
      </GraphView>
      <EpisodeBrandSequence from={60} duration={100} />
    </EpisodeTemplate>
  );
};

export const Episode0001Composition = () => {
  return (
    <Composition
      id={EPISODE_ID}
      component={Episode0001}
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