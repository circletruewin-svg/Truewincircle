import { useEffect, useRef } from "react";

// European single-zero wheel pocket order (clockwise starting from 0
// at the top of the wheel). This is the standard sequence printed on
// any regulated European roulette wheel.
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const SEG = 360 / WHEEL_ORDER.length;     // ~9.7297°
const CENTER = 110;                       // viewBox is 220x220
const R_OUTER = 105;
const R_INNER = 60;
const R_LABEL = 84;
const R_BALL  = 92;

const polar = (angleDeg, radius) => {
  const a = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0° is at top
  return { x: CENTER + radius * Math.cos(a), y: CENTER + radius * Math.sin(a) };
};

const wedgePath = (i) => {
  const a1 = i * SEG;
  const a2 = a1 + SEG;
  const p1 = polar(a1, R_OUTER);
  const p2 = polar(a2, R_OUTER);
  const p3 = polar(a2, R_INNER);
  const p4 = polar(a1, R_INNER);
  return `M ${p1.x} ${p1.y} A ${R_OUTER} ${R_OUTER} 0 0 1 ${p2.x} ${p2.y}
          L ${p3.x} ${p3.y} A ${R_INNER} ${R_INNER} 0 0 0 ${p4.x} ${p4.y} Z`;
};

const pocketColor = (n) => (n === 0 ? "#198754" : RED.has(n) ? "#c11414" : "#0e0e0e");

// Static wheel art — only rendered once per mount.
const StaticWheel = () => (
  <g>
    {/* Rim shadow */}
    <circle cx={CENTER} cy={CENTER} r={R_OUTER + 6} fill="#1a0f06" />
    <circle cx={CENTER} cy={CENTER} r={R_OUTER + 4} fill="url(#rim)" />
    {WHEEL_ORDER.map((n, i) => {
      const angleMid = i * SEG + SEG / 2;
      const labelPos = polar(angleMid, R_LABEL);
      return (
        <g key={n}>
          <path d={wedgePath(i)} fill={pocketColor(n)} stroke="#2a1a0c" strokeWidth="0.6" />
          <text
            x={labelPos.x}
            y={labelPos.y}
            fill="#fff"
            fontSize="8"
            fontWeight="900"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${angleMid} ${labelPos.x} ${labelPos.y})`}
          >
            {n}
          </text>
        </g>
      );
    })}
    {/* Inner hub */}
    <circle cx={CENTER} cy={CENTER} r={R_INNER - 2} fill="url(#hub)" />
    <circle cx={CENTER} cy={CENTER} r={R_INNER - 18} fill="#3a230e" stroke="#a07730" strokeWidth="1.5" />
    {/* Hub cross-bars */}
    {[0, 60, 120].map((a) => (
      <g key={a} transform={`rotate(${a} ${CENTER} ${CENTER})`}>
        <rect x={CENTER - 1.5} y={CENTER - R_INNER + 6} width="3" height={R_INNER * 2 - 12} fill="#a07730" />
      </g>
    ))}
    <circle cx={CENTER} cy={CENTER} r="5" fill="#facc15" />
  </g>
);

/**
 * RouletteWheel — animated European single-zero wheel.
 *
 * Props:
 *  - winningNumber: the resolved number (0-36). Falsy = idle wheel.
 *  - spinning: boolean. When true the wheel + ball rotate. When the
 *    parent already knows winningNumber, transition both so the ball
 *    lands in the right pocket.
 *  - onLanded: optional callback fired after the ball settles.
 */
export default function RouletteWheel({ winningNumber, spinning, onLanded }) {
  // useRef + manual style mutation gives us smoother control than
  // re-rendering on every animation frame.
  const wheelRef = useRef(null);
  const ballRef  = useRef(null);
  const wheelRot = useRef(0);
  const ballRot  = useRef(0);

  // Whenever a new winningNumber arrives (and spinning is true), pick a
  // generous final rotation that lands the right pocket under the
  // 12 o'clock pointer. The wheel spins clockwise; the ball spins
  // counter-clockwise so the visual reads as ball "settling into" a
  // moving pocket — which is exactly how a real wheel feels.
  useEffect(() => {
    if (!spinning) return;
    const idx = winningNumber == null ? 0 : WHEEL_ORDER.indexOf(winningNumber);
    if (idx < 0) return;

    // 6 full clockwise spins for wheel, then align so pocket idx ends at top.
    const finalWheel = wheelRot.current + 360 * 6 - (idx * SEG + SEG / 2);
    // 9 full counter-clockwise spins for the ball, ending at the
    // same angle so the ball appears to rest in the winning pocket.
    const finalBall  = ballRot.current  - 360 * 9 - (idx * SEG + SEG / 2);
    wheelRot.current = finalWheel;
    ballRot.current  = finalBall;

    if (wheelRef.current) {
      wheelRef.current.style.transition = "transform 4.2s cubic-bezier(0.18, 0.65, 0.22, 1)";
      wheelRef.current.style.transform = `rotate(${finalWheel}deg)`;
    }
    if (ballRef.current) {
      ballRef.current.style.transition = "transform 4.2s cubic-bezier(0.18, 0.65, 0.22, 1)";
      ballRef.current.style.transform  = `rotate(${finalBall}deg)`;
    }
    const t = setTimeout(() => onLanded?.(), 4250);
    return () => clearTimeout(t);
  }, [spinning, winningNumber, onLanded]);

  return (
    <div className="relative w-64 h-64 mx-auto select-none">
      {/* Wood rim & glow */}
      <div className="absolute inset-0 rounded-full shadow-[0_10px_50px_-15px_rgba(0,0,0,0.8)]" />
      {/* Pointer at 12 o'clock — winning pocket lands directly under it */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20">
        <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
      </div>

      <div className="absolute inset-0">
        <div
          ref={wheelRef}
          className="w-full h-full"
          style={{
            willChange: "transform",
            transformOrigin: "50% 50%",
          }}
        >
          <svg viewBox="0 0 220 220" className="w-full h-full">
            <defs>
              <radialGradient id="rim" cx="50%" cy="50%" r="50%">
                <stop offset="80%" stopColor="#3a230e" />
                <stop offset="100%" stopColor="#1a0f06" />
              </radialGradient>
              <radialGradient id="hub" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2a1a0c" />
                <stop offset="100%" stopColor="#1a0f06" />
              </radialGradient>
            </defs>
            <StaticWheel />
          </svg>
        </div>
      </div>

      {/* Ball orbit — independent rotation so it can spin opposite the wheel. */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          ref={ballRef}
          className="w-full h-full"
          style={{
            willChange: "transform",
            transformOrigin: "50% 50%",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ transform: `translate(0, -${R_BALL}px)` }}
          >
            <div className="h-3 w-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] -translate-x-1/2 -translate-y-1/2 absolute" />
          </div>
        </div>
      </div>
    </div>
  );
}
