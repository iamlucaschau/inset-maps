import { Composition, Folder } from "remotion";
import { PVR } from "./series/pvr/theme";
import { StyleFrames } from "../Map/p5-toledo-war/StyleFrames";
import { P5ToledoWar, p5ToledoWarDuration } from "../Map/p5-toledo-war/Video";
import { Cover, COVERS } from "../Map/covers";

/** Every episode is 1080×1920 @ 30 fps; its length comes from the voiceover timing. New episode: add one entry here. */
const EPISODES: { id: string; component: React.FC; duration: (fps: number) => number }[] = [
  { id: "Inset-P5-ToledoWar", component: P5ToledoWar, duration: p5ToledoWarDuration },
];

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Episodes">
      {EPISODES.map((e) => (
        <Composition key={e.id} id={e.id} component={e.component} width={PVR.width} height={PVR.height} fps={PVR.fps}
          durationInFrames={e.duration(PVR.fps)} />
      ))}
    </Folder>
    <Folder name="Covers">
      {COVERS.map((spec) => (
        <Composition key={spec.slug} id={`Cover-${spec.slug}`} component={Cover} defaultProps={{ slug: spec.slug }}
          width={PVR.width} height={PVR.height} fps={PVR.fps} durationInFrames={1} />
      ))}
    </Folder>
    <Folder name="Style">
      <Composition id="J-StyleFrames" component={StyleFrames} width={PVR.width} height={PVR.height} fps={PVR.fps} durationInFrames={360} />
    </Folder>
  </>
);
