import { AbsoluteFill, getInputProps } from "remotion";
import { PVR, SAFE } from "./theme";

/** QA overlay: paints the platform-UI danger zones red. Off unless --props='{"safeGuide":true}'. */
export const SafeGuide: React.FC = () => {
  if (!getInputProps().safeGuide) return null;
  const red = "rgba(255,0,60,0.35)";
  const zones: React.CSSProperties[] = [
    { left: 0, right: 0, top: 0, height: SAFE.top },
    { left: 0, right: 0, bottom: 0, height: SAFE.bottom },
    { left: 0, width: SAFE.left, top: SAFE.top, bottom: SAFE.bottom },
    { right: 0, width: SAFE.right, top: SAFE.top, bottom: SAFE.bottom },
  ];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {zones.map((z, i) => (
        <div key={i} style={{ position: "absolute", background: red, ...z }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top: SAFE.top,
          width: PVR.width - SAFE.left - SAFE.right,
          height: PVR.height - SAFE.top - SAFE.bottom,
          border: "4px dashed #ff003c",
          boxSizing: "border-box",
        }}
      />
    </AbsoluteFill>
  );
};
