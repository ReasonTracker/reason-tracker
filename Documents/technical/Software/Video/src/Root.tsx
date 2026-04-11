import { Composition } from "remotion";
import { Episode0001 } from "./episodes/Episode0001.tsx";
import { Episode0002 } from "./episodes/Episode0002.tsx";
import { toEpisodeDisplayName } from "./shared/episode.ts";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Episode0001"
        component={Episode0001}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          episodeId: "Episode0001",
          title: toEpisodeDisplayName("Episode0001"),
        }}
      />
      <Composition
        id="Episode0002"
        component={Episode0002}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          episodeId: "Episode0002",
          title: toEpisodeDisplayName("Episode0002"),
        }}
      />
    </>
  );
};