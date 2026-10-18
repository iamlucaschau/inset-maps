/**
 * Inset Maps covers (Shorts thumbnails, 1080×1920): one frame of an episode's Scene (no subtitles,
 * no audio) + a two-tier hook (small setup line, huge punch line), a coral ring / arrow on the one
 * thing to look at, and the channel tag. Same recipe as the Atlas Tí Hon covers (Lucas 2026-10-15:
 * the text must be strong enough to make people click). Every hook is a sourced claim of the episode.
 * Render: npx remotion still Cover-<slug> out/cover.png, then JPG (< 2 MB) to Map/<slug>/cover.jpg.
 */
import { AbsoluteFill, Sequence } from "remotion";
import { FONT, NIGHT } from "../Style Library/J-night-chart/night-chart";
import { Scene as ToledoScene } from "./p5-toledo-war/Video";

type Line = { text: string; punch?: boolean };
/** Ring around the focal point: ry = r, rx = r × wide (default 1.35); optional arrow from a point. */
type Mark = { x: number; y: number; r: number; wide?: number; arrowFrom?: [number, number] };
export type CoverSpec = { slug: string; Scene: React.FC; frame: number; hook: Line[]; y?: number; mark?: Mark };

const WIDTH = 940;
/** Largest size ≤ max that fits the column (Manrope 800 ≈ 0.62 em per character). */
const fit = (text: string, max: number) => Math.min(max, Math.floor(WIDTH / (text.length * 0.62)));

const Hook: React.FC<{ lines: Line[]; y: number }> = ({ lines, y }) => (
  <div style={{ position: "absolute", left: 40, width: 1000, top: y, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    {lines.map((l, i) => (
      <div key={i} style={{
        fontFamily: FONT, fontWeight: 800, lineHeight: 1.08, textAlign: "center", whiteSpace: "nowrap", letterSpacing: -2,
        fontSize: fit(l.text, l.punch ? 210 : 96), color: l.punch ? NIGHT.coral : NIGHT.white,
        WebkitTextStroke: `${l.punch ? 20 : 14}px ${NIGHT.ink}`, paintOrder: "stroke fill", textShadow: "0 12px 30px rgba(0,0,0,0.65)",
        rotate: l.punch ? "-2deg" : "0deg",
      }}>
        {l.text}
      </div>
    ))}
  </div>
);

const Ring: React.FC<{ m: Mark }> = ({ m }) => (
  <svg width={1080} height={1920} style={{ position: "absolute" }}>
    {m.arrowFrom && (() => {
      const [ax, ay] = m.arrowFrom;
      const len = Math.hypot(m.x - ax, m.y - ay);
      const ex = m.x - ((m.x - ax) / len) * (m.r * (m.wide ?? 1.35) * 0.8 + 14);
      const ey = m.y - ((m.y - ay) / len) * (m.r + 14);
      const angle = (Math.atan2(m.y - ay, m.x - ax) * 180) / Math.PI;
      return (
        <g>
          <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={NIGHT.ink} strokeWidth={30} strokeLinecap="round" />
          <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={NIGHT.coral} strokeWidth={18} strokeLinecap="round" />
          <g style={{ translate: `${ex}px ${ey}px`, rotate: `${angle}deg` }}>
            <path d="M 8 0 L -40 -30 L -40 30 Z" fill={NIGHT.coral} stroke={NIGHT.ink} strokeWidth={6} strokeLinejoin="round" />
          </g>
        </g>
      );
    })()}
    <ellipse cx={m.x} cy={m.y} rx={m.r * (m.wide ?? 1.35)} ry={m.r} fill="none" stroke={NIGHT.ink} strokeWidth={26} />
    <ellipse cx={m.x} cy={m.y} rx={m.r * (m.wide ?? 1.35)} ry={m.r} fill="none" stroke={NIGHT.coral} strokeWidth={14} />
  </svg>
);

const Brand: React.FC = () => (
  <div style={{ position: "absolute", left: 0, right: 80, top: 1350, display: "flex", justifyContent: "center" }}>
    <div style={{
      fontFamily: FONT, fontWeight: 800, fontSize: 46, letterSpacing: 4, color: NIGHT.white, padding: "8px 30px", borderRadius: 40,
      background: NIGHT.card, border: `5px solid ${NIGHT.coral}`,
    }}>
      INSET MAPS
    </div>
  </div>
);

export const COVERS: CoverSpec[] = [
  {
    slug: "p5-toledo-war",
    Scene: ToledoScene,
    frame: 1732, // the Upper Peninsula, close, lit, just before "Iron."
    hook: [{ text: "Michigan lost a war to Ohio." }, { text: "Then it got" }, { text: "THIS.", punch: true }],
    y: 240,
    mark: { x: 515, y: 800, r: 150, wide: 2.75, arrowFrom: [880, 1180] },
  },
];

export const Cover: React.FC<{ slug: string }> = ({ slug }) => {
  const spec = COVERS.find((c) => c.slug === slug)!;
  return (
    <AbsoluteFill>
      {/* a 1-frame composition: shift the Scene so its frame `spec.frame` is this one */}
      <Sequence from={-spec.frame} durationInFrames={spec.frame + 1} layout="none">
        <spec.Scene />
      </Sequence>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(5,9,14,0.75) 0%, rgba(5,9,14,0) 38%)" }} />
      {spec.mark && <Ring m={spec.mark} />}
      <Hook lines={spec.hook} y={spec.y ?? 250} />
      <Brand />
    </AbsoluteFill>
  );
};
