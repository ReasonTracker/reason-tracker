import { useMemo } from "react";
import { Composition } from "remotion";
import type { ClaimId } from "@reasontracker/contracts";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import {
  episode0001Debate,
  episode0001PropagationDirectives,
} from "./Episode0001/graphData.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { CameraMove, GraphView } from "../shared/GraphView.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";
import { Fade } from "../shared/Fade.tsx";
import { buildEpisodePropagationPlan } from "../shared/propagationAnimation.ts";
import { useMarkdownTimelineDocument } from "../shared/timelineMarkdown.ts";

const EPISODE_ID = "Episode0001";
const EPISODE_TITLE = "Episode 1";
const EPISODE_FPS = 30;
const TOTAL_EPISODE_FRAMES = 300;
const TIMELINE_MARKDOWN_SRC = "episodes/Episode0001/timeline.md";

const cameraMoveOptions = {
  padding: 200,
};

export const Episode0001 = (_props: EpisodeCompositionProps) => {
  const propagationPlan = useMemo(
    () => buildEpisodePropagationPlan({
      debate: episode0001Debate,
      directives: episode0001PropagationDirectives,
      fps: EPISODE_FPS,
      cycleHandling: "fail",
    }),
    [],
  );
  const timelineDocument = useMarkdownTimelineDocument({
    src: TIMELINE_MARKDOWN_SRC,
    fps: EPISODE_FPS,
  });

  if (!timelineDocument) {
    return null;
  }

  if (!propagationPlan.animationResult.ok) {
    throw new Error(propagationPlan.animationResult.message);
  }

  const backgroundTimes = timelineDocument.timelines.background.times;
  const overlayTimes = timelineDocument.timelines.overlay.times;
  const cameraTimes = timelineDocument.timelines.camera.times;

  return (
    <EpisodeTemplate>
      <Fade
        {...backgroundTimes.graph}
        fadeInSeconds={0.7}
        fadeOutSeconds={0.7}
        name="Graph Fade"
      >
        <GraphView
          debate={episode0001Debate}
          cameraFrameOffset={propagationPlan.cameraFrameOffset}
          propagationKeyStates={propagationPlan.animationResult.keyStates}
          siblingOrderingMode="preserve-input"
        >
          <CameraMove
            {...cameraMoveOptions}
            {...cameraTimes.mainCamera}
            claimId={"main" as ClaimId}
          />
          <CameraMove
            {...cameraTimes.bCamera}
            claimId={"b" as ClaimId}
            {...cameraMoveOptions}
          />
          <CameraMove
            {...cameraTimes.aCamera}
            claimId={"a" as ClaimId}
            {...cameraMoveOptions}
          />
          <CameraMove
            {...cameraTimes.resetCamera}
            reset
          />
        </GraphView>
      </Fade>
      <EpisodeBrandSequence {...overlayTimes.brand} />
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
