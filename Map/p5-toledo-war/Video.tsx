/**
 * Inset Maps · P5 Home Turf · "Why the Upper Peninsula Isn't Wisconsin" (Toledo War, 1835–36).
 * Script + sources: kich-ban-p5-toledo-war-FINAL.md, cong-2_so-nguon.md. Style J "Night Chart".
 * Every cue comes from the VO timing (`at(id, k)`). Soft loop: the VO ends on a whole sentence; the
 * map flies home during line 29 and every layer clears by the end, so the last frame is the first.
 *
 * Map notes (Gate 2 §3): the two survey lines are drawn from the sources' description and are
 * APPROXIMATE (Michigan's = due east from Lake Michigan's southern tip; Ohio's ≈ today's border).
 * The "old maps" line is ILLUSTRATIVE (no source gives how far north the old maps were).
 * Before the 1836 deal the whole of Michigan is dimmed; the Upper Peninsula lights up at the deal.
 */
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import timing from "../../src/voiceover/p5-toledo-war.timing.json";
import words from "../../src/voiceover/p5-toledo-war.words.json";
import { episodeDuration } from "../../src/series/pvr/episode";
import { SafeGuide } from "../../src/series/pvr/safe";
import { MusicBed, PILLAR_MUSIC, SfxCues, type SfxCue } from "../../src/series/pvr/sfx";
import { CLAMP, pop, prog } from "../../Style Library/kit-common";
import { KaraokeSubs } from "../../Style Library/subs";
import {
  Arrow, beats, camAt, Compass, definePart, type Fill, GeoArea, type GeoCam, GeoLine, Inset, KeyCard, MeasureTag, NIGHT, NightMap,
  NightSub, Outline, PhotoCard, Pin, PlaceTag, seamKeys, show, toScreen,
} from "../../Style Library/J-night-chart/night-chart";

const FPS = 30;
const { at } = beats(timing, FPS);
const END = episodeDuration(timing, FPS);

definePart("Upper Peninsula", "Michigan", (_lon, lat) => lat > 45.9);

const VIEW = {
  hook: { lon: -86.4, lat: 45.2, zoom: 26 },
  lakes: { lon: -85.3, lat: 42.9, zoom: 32 },
  war: { lon: -84.2, lat: 42.4, zoom: 36 },
  up: { lon: -87.4, lat: 46.6, zoom: 50 },
};
const KEYS0: GeoCam[] = [
  { at: 0, ...VIEW.hook },
  { at: at("04") - 6, ...VIEW.lakes },
  { at: at("10") - 6, ...VIEW.war },
  { at: at("19") - 6, ...VIEW.hook },
  { at: at("23") - 6, ...VIEW.up },
  { at: at("29") - 4, ...VIEW.hook },
];
const PUSH = 0.04;
const PUSH_CAP = 0.1;
// loop seam: the last frame lands exactly on the opening framing
const KEYS = seamKeys(KEYS0, END, PUSH, PUSH_CAP);

const MI = NIGHT.a;
const OH = NIGHT.b;

/** The 1787 line: due east from Lake Michigan's southern tip (= Michigan's 1818 survey). */
const LINE_1787: [number, number][] = [[-87.25, 41.62], [-83.38, 41.62]];
/** Illustrative: how far north the old maps put Lake Michigan (no source gives the real offset). */
const OLD_SHIFT: [number, number] = [0, 0.45];
const FULTON: [number, number][] = [[-84.806, 41.62], [-83.42, 41.62]];
/** Ohio's survey ≈ today's Ohio–Michigan border: Indiana corner → north cape of Maumee Bay. */
const HARRIS: [number, number][] = [[-84.806, 41.6955], [-83.454, 41.7327]];
const STRIP: [number, number][] = [[-84.806, 41.62], [-84.806, 41.6955], [-83.454, 41.7327], [-83.0, 41.7327], [-83.0, 41.62]];
const TOLEDO: [number, number] = [-83.555, 41.654];
const NEGAUNEE: [number, number] = [-87.611, 46.499];
const KEWEENAW: [number, number] = [-88.45, 47.25];
const INSET_CAM: GeoCam = { at: 0, lon: -83.85, lat: 41.7, zoom: 240 };
/** Movements (schematic): Michigan's militia south toward Toledo, Ohio's push north. */
const MI_MARCH: [number, number][] = [[-83.0, 43.3], [-83.35, 42.55], [-83.72, 41.8]];
const OH_MARCH: [number, number][] = [[-83.05, 40.15], [-83.4, 40.9], [-83.68, 41.58]];
/** Illustrative mine dots: iron range west of Negaunee, copper country on the Keweenaw. */
const IRON: [number, number][] = [[-87.61, 46.5], [-87.67, 46.49], [-87.74, 46.47], [-87.55, 46.52]];
const COPPER: [number, number][] = [[-88.45, 47.25], [-88.58, 47.12], [-88.32, 47.32], [-88.68, 47.03], [-88.2, 47.38], [-88.52, 47.18],
  [-88.75, 46.98], [-88.1, 47.42]];

/** Michigan dim until the deal; the UP lights up at "take the western Upper Peninsula". */
const fillsAt = (f: number): Fill[] => {
  const deal = at("19", 0.62);
  const ohio = show(f, at("05", 0.5), at("31")) * 0.9;
  const upFull = f < at("04") - 6 ? 1 : prog(f, deal, 12);
  return [
    { name: "Michigan", color: MI, o: 0.5 },
    { name: "Upper Peninsula", color: MI, o: Math.max(0.5, upFull), edge: upFull > 0.5 },
    ...(ohio > 0 ? [{ name: "Ohio", color: OH, o: ohio }] : []),
  ];
};

/** Rolling dollar amount: counts up over 18 frames from `a`, in steps of $1,000. */
const money = (f: number, a: number, to: number) =>
  `$${(Math.round(interpolate(f, [a, a + 18], [0, to], CLAMP) / 1000) * 1000).toLocaleString("en-US")}`;

const glowFlash = (f: number, g: number) => (f >= g && f < g + 30 ? Math.sin((Math.PI * 2 * (f - g)) / 30) ** 2 : 0);

export const Scene: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camAt(KEYS, f, PUSH, PUSH_CAP);
  const s = (id: string, k = 0) => at(id, k);
  // the 9 arrested surveyors: dots along Ohio's line, popping in, then turning Michigan's colour
  const surveyors = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 0.5) / 9;
    const lon = HARRIS[0][0] + (HARRIS[1][0] - HARRIS[0][0]) * t;
    const lat = HARRIS[0][1] + (HARRIS[1][1] - HARRIS[0][1]) * t - 0.02;
    return { p: toScreen(cam, lon, lat), from: s("15", 0.55) + i * 2 };
  });
  const hatch = show(f, s("09"), s("19", 0.4));
  return (
    <AbsoluteFill>
      <NightMap cam={cam} fills={fillsAt(f)} f={f} />

      {/* S1 hook: the peninsula, Wisconsin, Michigan, then Toledo */}
      <Outline cam={cam} name="Upper Peninsula" color={MI} flash={glowFlash(f, 0) + glowFlash(f, s("19", 0.62)) + glowFlash(f, s("30"))} />
      {/* hook cards stack with the words; the first one is already up at frame 0 (thumbnail) and pops back in the
          loop tail, so the last frame matches the first */}
      <KeyCard value="Touches Wisconsin" f={f} at={-12} out={s("03")} size={72} y={330} />
      <KeyCard value="Touches Wisconsin" f={f} at={END - 12} size={72} y={330} />
      <KeyCard value="Belongs to Michigan" f={f} at={s("02", 0.35)} out={s("03")} size={72} y={480} color={MI} />
      <PlaceTag cam={cam} f={f} name="Wisconsin" label="Wisconsin" anchor={[-89.7, 44.5]} glow={[s("01", 0.7)]} o={0} />
      <PlaceTag cam={cam} f={f} name="Michigan" label="Michigan" anchor={[-84.7, 43.4]} color={MI} from={s("05")} glow={[s("02", 0.6), s("05")]}
        o={show(f, s("05"), s("06"))} />
      <PlaceTag cam={cam} f={f} name="Ohio" label="Ohio" anchor={[-82.7, 40.4]} color={OH} from={s("05", 0.5)} glow={[s("05", 0.5)]}
        o={show(f, s("05", 0.5), s("06"))} />
      <Pin cam={cam} f={f} at={TOLEDO} label="Toledo" from={s("03", 0.2)} side="below" o={show(f, s("03", 0.2), s("04"))} />

      {/* S2 the 1787 line, and where the old maps put it */}
      <KeyCard value="1787" f={f} at={s("04", 0.05)} out={s("05")} />
      <GeoLine cam={cam} ll={LINE_1787} p={prog(f, s("04", 0.35), 30)} color={NIGHT.white} w={10} glow flow={f} o={show(f, s("04"), s("10"))} />
      <Outline cam={cam} name="Lake Michigan" color={NIGHT.coral} shift={OLD_SHIFT} march={f} flash={show(f, s("06", 0.3), s("07"))} />
      <Pin cam={cam} f={f} at={[-87.2, 41.62 + OLD_SHIFT[1]]} label="Old maps" from={s("06", 0.5)} side="right" o={show(f, s("06", 0.5), s("07"))} />

      {/* S3 the strip: inset (channel signature) */}
      <GeoArea cam={cam} id="strip" ring={STRIP} color={MI} hatch={OH} clipTo="Ohio" edge={NIGHT.white} o={hatch} />
      <Inset x={90} y={250} w={820} h={600} cam={INSET_CAM} mainCam={cam} target={[-84.1, 41.68]} f={f} from={s("07") - 4} out={s("10")}
        fills={[{ name: "Ohio", color: OH, o: 0.35 }, { name: "Michigan", color: MI, o: 0.35 }]}>
        {(ic) => (
          <>
            <GeoArea cam={ic} id="strip-in" ring={STRIP} color={MI} hatch={OH} clipTo="Ohio" edge={NIGHT.white} o={show(f, s("09"))} />
            <GeoLine cam={ic} ll={HARRIS} p={prog(f, s("07", 0.15), 24)} color={OH} />
            <GeoLine cam={ic} ll={FULTON} p={prog(f, s("08", 0.15), 24)} color={MI} />
            <Pin cam={ic} f={f} at={TOLEDO} label="Toledo" from={s("07", 0.7)} side="below" />
            <MeasureTag a={toScreen(ic, -83.5, 41.62)} b={toScreen(ic, -83.5, 41.729)} text="8 mi · 13 km" f={f} from={s("09", 0.55)}
              at={[toScreen(ic, -83.5, 41.68)[0] - 230, toScreen(ic, -83.5, 41.74)[1] - 110]} />
          </>
        )}
      </Inset>

      {/* S4 the war */}
      <KeyCard value="1835" f={f} at={s("10", 0.05)} out={s("11")} />
      {/* the one archival photo: Stevens T. Mason, portrait by Thomas Mickell Burnham, c. 1837 (Detroit Institute of Arts, public domain) */}
      <PhotoCard src="images/p5-toledo-war/mason-burnham-1837.jpg" x={110} y={250} w={330} h={400} f={f} at={s("11")} out={s("13")} />
      <KeyCard value="23" sub="Boy Governor" f={f} at={s("11", 0.6)} out={s("13")} color={MI} x={680} y={420} />
      <Arrow cam={cam} ll={MI_MARCH} p={prog(f, s("10", 0.3), 24)} f={f} color={MI} o={show(f, s("10", 0.3), s("13")) + show(f, s("15"), s("16", 0.6))} />
      <Arrow cam={cam} ll={OH_MARCH} p={prog(f, s("10", 0.45), 24)} f={f} color={OH} o={show(f, s("10", 0.45), s("13")) + show(f, s("15"), s("16", 0.6))} />
      <KeyCard value={money(f, s("13", 0.45), 300000)} sub="Ohio" f={f} at={s("13", 0.45)} out={s("15")} color={OH} y={1010} />
      <KeyCard value={money(f, s("14", 0.45), 315000)} sub="Michigan +$15,000" f={f} at={s("14", 0.45)} out={s("15")} color={MI} />
      {/* shots fired into the air: three rings over the strip */}
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        {[0.25, 0.5, 0.75].map((t, i) => {
          const a = s("15", 0.3) + i * 6;
          const k = prog(f, a, 14);
          const [x, y] = toScreen(cam, HARRIS[0][0] + (HARRIS[1][0] - HARRIS[0][0]) * t, 41.72);
          return f >= a && k < 1 ? <circle key={i} cx={x} cy={y} r={10 + 50 * k} fill="none" stroke={NIGHT.white} strokeWidth={5} opacity={1 - k} /> : null;
        })}
      </svg>
      <svg width={1080} height={1920} style={{ position: "absolute", opacity: show(f, s("15", 0.5), s("16", 0.6)) }}>
        {surveyors.map(({ p, from }, i) => (
          <g key={i} style={{ translate: `${p[0]}px ${p[1]}px`, scale: pop(f, from) }}>
            <circle r={9} fill={interpolate(f, [s("15", 0.85), s("15", 0.95)], [0, 1], CLAMP) > 0.5 ? MI : NIGHT.white}
              stroke={NIGHT.ink} strokeWidth={3} />
          </g>
        ))}
      </svg>
      <KeyCard value="1 sheriff" f={f} at={s("17", 0.1)} out={s("18", 0.65)} />
      <KeyCard value="Two Stickney" f={f} at={s("18", 0.66)} out={s("19", 0.3)} color={NIGHT.coral} size={92} />
      <Pin cam={cam} f={f} at={TOLEDO} from={s("17", 0.1)} o={show(f, s("17", 0.1), s("19"))} />

      {/* S5 the deal */}
      <KeyCard value="No" f={f} at={s("20", 0.3)} out={s("21", 0.5)} color={NIGHT.coral} />
      <KeyCard value="Yes" sub="Dec 1836" f={f} at={s("21", 0.6)} out={s("22")} color={MI} />
      <KeyCard value="The rivalry" sub="Some say" f={f} at={s("22", 0.35)} out={s("23")} size={92} />

      {/* S6 the consolation prize (hero moment: "Iron.") */}
      <KeyCard value="Iron" f={f} at={s("24")} out={s("25")} color={NIGHT.coral} size={120} />
      <KeyCard value="Copper" f={f} at={s("25")} out={s("26")} color={NIGHT.coral} size={120} />
      <KeyCard value="1844" f={f} at={s("26", 0.05)} out={s("28")} />
      <Compass x={540} y={1060} f={f} at={s("26", 0.2)} spinAt={s("26", 0.62)} out={s("27", 0.6)} />
      <Pin cam={cam} f={f} at={NEGAUNEE} label={f >= s("27") ? "Iron" : undefined} from={s("24")} side="left" o={show(f, s("24"), s("28"))} />
      <Pin cam={cam} f={f} at={KEWEENAW} label={f >= s("28") ? "Copper" : undefined} from={s("25")} side="left" o={show(f, s("25"), s("29"))} />
      <KeyCard value="40 years" sub="#1 in copper" f={f} at={s("28", 0.35)} out={s("29")} color={MI} />
      <Outline cam={cam} name="Upper Peninsula" color={MI} march={f} flash={show(f, s("23"), s("29")) * 0.8} />
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        {[...IRON.map((p, i) => ({ p, from: s("27", 0.2) + i * 3, c: NIGHT.white, end: s("28") })),
          ...COPPER.map((p, i) => ({ p, from: s("28", 0.1) + i * 3, c: NIGHT.coral, end: s("29") }))].map(({ p, from, c, end }, i) => {
          const [x, y] = toScreen(cam, ...p);
          return f >= from ? (
            <circle key={i} cx={x} cy={y} r={9} fill={c} stroke={NIGHT.ink} strokeWidth={3}
              style={{ scale: pop(f, from), transformBox: "fill-box", transformOrigin: "center" }} opacity={show(f, from, end)} />
          ) : null;
        })}
      </svg>

      {/* S7 wrap: Ohio got Toledo, Michigan got the copper; everything clears back to frame 0 */}
      <Pin cam={cam} f={f} at={TOLEDO} label="Toledo" from={s("29", 0.2)} side="below" o={show(f, s("29", 0.2), s("31"))} />
      <Outline cam={cam} name="Ohio" color={OH} flash={glowFlash(f, s("29", 0.2))} />

      <SafeGuide />
    </AbsoluteFill>
  );
};

/** On-screen captions (numerals; VO says the words). */
const CAPTIONS: Record<string, string> = {
  "09": "Between them: a strip up to 8 miles wide.",
  "28": "Then, for 40 years, Michigan mined more copper than any other state.",
};

const W = "whoosh/clean-whoosh-382726.mp3";
/** Real SFX, one per beat at most: soft whooshes on the flights, a click on the inset, one deep hit on the twist. */
const SFX: SfxCue[] = [
  [W, "04", 0, -8, -20],
  ["click/digital-click-357350.mp3", "07", 0, -2, -20],
  [W, "10", 0, -8, -20],
  [W, "19", 0, -8, -20],
  ["deephit/deep-hit-175726.mp3", "24", 0, 0, -16],
  [W, "29", 0, -6, -20],
];

export const P5ToledoWar: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: NIGHT.ocean }}>
    <Scene />
    <KaraokeSubs timing={timing} words={words} captions={CAPTIONS} Skin={NightSub} oneLine maxWords={3} maxChars={18} />
    <Audio name="VO" src={staticFile("voiceover/p5-toledo-war/vo.mp3")} />
    <MusicBed file={PILLAR_MUSIC.P5} />
    <SfxCues timing={timing} cues={SFX} />
  </AbsoluteFill>
);

export const p5ToledoWarDuration = (fps: number) => episodeDuration(timing, fps);
