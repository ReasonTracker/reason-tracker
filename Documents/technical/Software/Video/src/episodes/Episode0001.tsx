import { Sequence } from "remotion";
import type { ClaimId } from "@reasontracker/contracts";
import type { EpisodeCompositionProps } from "../shared/episode.ts";
import { episode0001Debate } from "./Episode0001/graphData.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { GraphView } from "../shared/GraphView.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";

const BRAND_SEQUENCE_START = 60;
const BRAND_SEQUENCE_FRAMES = 150;
const FRAMES_PER_SECOND = 30;
const GRAPH_ZOOM_START = BRAND_SEQUENCE_START + BRAND_SEQUENCE_FRAMES + FRAMES_PER_SECOND;
const GRAPH_ZOOM_CLAIM_ID = "a" as ClaimId;
const GRAPH_ZOOM_DURATION = 90;
const GRAPH_ZOOM_PADDING = 36;

export const Episode0001 = (_props: EpisodeCompositionProps) => {
  return (
    <EpisodeTemplate>
      <GraphView
        debate={episode0001Debate}
        zoomClaimId={GRAPH_ZOOM_CLAIM_ID}
        zoomDurationInFrames={GRAPH_ZOOM_DURATION}
        zoomPadding={GRAPH_ZOOM_PADDING}
        zoomStartFrame={GRAPH_ZOOM_START}
      />
      <Sequence from={BRAND_SEQUENCE_START} durationInFrames={BRAND_SEQUENCE_FRAMES}>
        <EpisodeBrandSequence />
      </Sequence>
    </EpisodeTemplate>
  );
};