import { Composition } from "remotion";
import type { ClaimId, ConnectorId } from "@reasontracker/contracts";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import { wait, buildTimelineTimes } from "../shared/timeline.ts";
import { episode0001Debate } from "./Episode0001/graphData.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { CameraMove, GraphEvents, GraphView } from "../shared/GraphView.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";
import { Fade } from "../shared/Fade.tsx";

const EPISODE_ID = "Episode0001";
const EPISODE_TITLE = "Episode 1";
const EPISODE_FPS = 30;

const cameraMoveOptions = {
  padding: 200,
};
const claimRId = "r" as ClaimId;
const claimBId = "b" as ClaimId;
const connector27Id = "connector:27" as ConnectorId;

const graphEvents = buildTimelineTimes([
  ["BackgroundFadeIn", 0.7],
  ["brand", 3.3],
  ["mainCamera", 1.7],
  [wait, 0.7],
  ["bCamera", 1.7],
  ["addClaimR", 5],
  [wait, 1],
  ["aCamera", 1.7],
  [wait, 0.3],
  ["resetCamera", 1.7],
  ["BackgroundFadeout", 0.7],
] as const, EPISODE_FPS);

const TOTAL_EPISODE_FRAMES = graphEvents.totalDurationInFrames;

export const Episode0001 = (_props: EpisodeCompositionProps) => {
  const graphEventTimes = graphEvents.times;
  const graphFadeFrom = graphEventTimes.BackgroundFadeIn.from;
  const graphFadeDurationInFrames = graphEventTimes.BackgroundFadeout.from
    + graphEventTimes.BackgroundFadeout.durationInFrames
    - graphFadeFrom;

  return (
    <EpisodeTemplate>
      <Fade
        from={graphFadeFrom}
        durationInFrames={graphFadeDurationInFrames}
        fadeInFrames={graphEventTimes.BackgroundFadeIn.durationInFrames}
        fadeOutFrames={graphEventTimes.BackgroundFadeout.durationInFrames}
        name="Graph Fade"
      >
        <GraphView
          debate={episode0001Debate}
          siblingOrderingMode="preserve-input"
        >
          <CameraMove
            {...cameraMoveOptions}
            {...graphEventTimes.mainCamera}
            claimId="main"
          />
          <GraphEvents
            {...graphEventTimes.addClaimR}
            id="addClaimR"
            actions={[
              {
                kind: "claim.upsert",
                claim: {
                  id: claimRId,
                  content: "Additional evidence R",
                  side: "proMain",
                },
              },
              {
                kind: "connector.upsert",
                connector: {
                  id: connector27Id,
                  source: claimRId,
                  target: claimBId,
                  affects: "confidence",
                },
              },
            ]}
          />
          <CameraMove
            {...cameraMoveOptions}
            {...graphEventTimes.bCamera}
            claimId={["b", "e", "f", "i", "o"]}
          />
          <CameraMove
            {...cameraMoveOptions}
            {...graphEventTimes.aCamera}
            claimId="a"
          />
          <CameraMove
            {...graphEventTimes.resetCamera}
            reset
          />
        </GraphView>
      </Fade>
      <EpisodeBrandSequence {...graphEventTimes.brand} />
    </EpisodeTemplate>
  );
};

export const Episode0001Composition = () => {
  return (
    <Composition
      id={EPISODE_ID}
      component={Episode0001}
      durationInFrames={TOTAL_EPISODE_FRAMES}
      fps={EPISODE_FPS}
      width={1920}
      height={1080}
      defaultProps={{
        episodeId: EPISODE_ID,
        title: EPISODE_TITLE,
      }}
    />
  );
};
