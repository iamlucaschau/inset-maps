import { Composition, Folder } from "remotion";
import { PVR } from "./series/pvr/theme";

/** Every episode is 1080×1920 @ 30 fps; its length comes from the voiceover timing. New episode: add one entry here. */
const EPISODES: { id: string; component: React.FC; duration: (fps: number) => number }[] = [];

export const RemotionRoot: React.FC = () => (
  <Folder name="Episodes">
    {EPISODES.map((e) => (
      <Composition key={e.id} id={e.id} component={e.component} width={PVR.width} height={PVR.height} fps={PVR.fps}
        durationInFrames={e.duration(PVR.fps)} />
    ))}
  </Folder>
);
