/**
 * Style J look test for the Toledo pilot (Gate 4): four 3-second shots with sample subtitles, so
 * Lucas can approve the look before the full episode is built. Not an episode.
 */
import { AbsoluteFill, Series, useCurrentFrame } from "remotion";
import { KaraokeSubs } from "../../Style Library/subs";
import {
  Compass, definePart, GeoArea, GeoLine, Inset, KeyCard, MeasureTag, NightMap, NightSub, NIGHT, Outline, Pin, PlaceTag, toScreen,
  type GeoCam,
} from "../../Style Library/J-night-chart/night-chart";
import { SafeGuide } from "../../src/series/pvr/safe";

definePart("Upper Peninsula", "Michigan", (_lon, lat) => lat > 45.9);

/** Michigan's survey = the 1787 line: due east from Lake Michigan's southern tip (Gate 2 §3). */
const FULTON: [number, number][] = [[-84.806, 41.62], [-83.42, 41.62]];
/** Ohio's survey ≈ today's Ohio–Michigan border: Indiana corner → north cape of Maumee Bay. */
const HARRIS: [number, number][] = [[-84.806, 41.6955], [-83.454, 41.7327]];
const STRIP: [number, number][] = [[-84.806, 41.62], [-84.806, 41.6955], [-83.454, 41.7327], [-83.0, 41.7327], [-83.0, 41.62]];
const TOLEDO: [number, number] = [-83.555, 41.654];

const subs = (text: string) => ({ lines: [{ id: "1", start: 0.2, end: 2.6, text }] });

const Shot: React.FC<{ cam: GeoCam; sub: string; children?: (f: number) => React.ReactNode; fills: React.ComponentProps<typeof NightMap>["fills"] }> = ({
  cam, sub, children, fills,
}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <NightMap cam={cam} fills={fills} f={f} />
      {children?.(f)}
      <KaraokeSubs timing={subs(sub)} Skin={NightSub} maxWords={3} maxChars={18} oneLine />
      <SafeGuide />
    </AbsoluteFill>
  );
};

const HOOK: GeoCam = { at: 0, lon: -86.4, lat: 45.2, zoom: 26 };
const STRIP_CAM: GeoCam = { at: 0, lon: -83.85, lat: 41.7, zoom: 240 };
const STRIP_MAIN: GeoCam = { at: 0, lon: -84.4, lat: 43.6, zoom: 36 };
const WAR: GeoCam = { at: 0, lon: -84.2, lat: 42.4, zoom: 36 };
const UP: GeoCam = { at: 0, lon: -87.4, lat: 46.6, zoom: 50 };

export const StyleFrames: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={90} name="Hook">
      <Shot cam={HOOK} sub="This peninsula touches Wisconsin." fills={[
        { name: "Upper Peninsula", color: NIGHT.a },
        { name: "Michigan", color: NIGHT.a, o: 0.45 },
      ]}>
        {(f) => (
          <>
            <Outline cam={HOOK} name="Upper Peninsula" color={NIGHT.a} flash={Math.sin((Math.PI * Math.min(f, 30)) / 30) ** 2} />
            <PlaceTag cam={HOOK} f={f} name="Wisconsin" label="Wisconsin" anchor={[-89.7, 44.5]} from={10} glow={[40]} />
            <PlaceTag cam={HOOK} f={f} name="Michigan" label="Michigan" anchor={[-84.7, 43.4]} color={NIGHT.a} from={20} />
          </>
        )}
      </Shot>
    </Series.Sequence>
    <Series.Sequence durationInFrames={90} name="Strip">
      <Shot cam={STRIP_MAIN} sub="a strip eight miles wide" fills={[
        { name: "Ohio", color: NIGHT.b, o: 0.6 },
        { name: "Michigan", color: NIGHT.a, o: 0.6 },
      ]}>
        {(f) => (
          <>
            <GeoArea cam={STRIP_MAIN} id="strip-main" ring={STRIP} color={NIGHT.a} hatch={NIGHT.b} clipTo="Ohio" edge={NIGHT.white} />
            <Inset x={90} y={250} w={820} h={600} cam={STRIP_CAM} mainCam={STRIP_MAIN} target={[-84.1, 41.68]} f={f} from={5}
              fills={[{ name: "Ohio", color: NIGHT.b, o: 0.35 }, { name: "Michigan", color: NIGHT.a, o: 0.35 }]}>
              {(cam) => (
                <>
                  <GeoArea cam={cam} id="strip-in" ring={STRIP} color={NIGHT.a} hatch={NIGHT.b} clipTo="Ohio" edge={NIGHT.white} />
                  <GeoLine cam={cam} ll={HARRIS} p={Math.min(1, f / 20)} color={NIGHT.b} />
                  <GeoLine cam={cam} ll={FULTON} p={Math.min(1, f / 20)} color={NIGHT.a} />
                  <Pin cam={cam} f={f} at={TOLEDO} label="Toledo" from={12} side="below" />
                  <MeasureTag a={toScreen(cam, -83.5, 41.62)} b={toScreen(cam, -83.5, 41.729)} text="8 mi · 13 km" f={f} from={25}
                    at={[toScreen(cam, -83.5, 41.68)[0] - 230, toScreen(cam, -83.5, 41.74)[1] - 110]} />
                </>
              )}
            </Inset>
          </>
        )}
      </Shot>
    </Series.Sequence>
    <Series.Sequence durationInFrames={90} name="Budget">
      <Shot cam={WAR} sub="Michigan set aside" fills={[
        { name: "Ohio", color: NIGHT.b },
        { name: "Michigan", color: NIGHT.a },
      ]}>
        {(f) => (
          <>
            <KeyCard value="$315,000" sub="Michigan" f={f} at={20} color={NIGHT.a} />
            <KeyCard value="$300,000" sub="Ohio" f={f} at={5} color={NIGHT.b} y={1010} />
          </>
        )}
      </Shot>
    </Series.Sequence>
    <Series.Sequence durationInFrames={90} name="Iron">
      <Shot cam={UP} sub="his compass needle" fills={[{ name: "Upper Peninsula", color: NIGHT.a }]}>
        {(f) => (
          <>
            <KeyCard value="1844" f={f} at={0} />
            <Pin cam={UP} f={f} at={[-87.611, 46.499]} from={6} />
            <Compass x={540} y={1060} f={f} at={10} spinAt={35} />
          </>
        )}
      </Shot>
    </Series.Sequence>
  </Series>
);
