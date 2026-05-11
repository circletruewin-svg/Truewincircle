// Two parallax cloud layers for the Aviator flight arena. Pure SVG +
// CSS — no images, no canvas. The faster layer sits in front (denser
// alpha) so the slower back layer reads as distant haze.
//
// Use inside the `relative` arena container; renders absolutely
// positioned so it doesn't push anything around.

const cloudPath = (cx, cy, scale = 1) => {
  // Compact cumulus path — three overlapping circles roughly mimic
  // the silhouette of a single cartoon cloud.
  const s = scale;
  return `
    M ${cx - 20 * s} ${cy} a ${10 * s} ${10 * s} 0 0 1 ${20 * s} 0
    a ${14 * s} ${14 * s} 0 0 1 ${22 * s} 0
    a ${10 * s} ${10 * s} 0 0 1 ${16 * s} 4
    a ${8 * s} ${8 * s} 0 0 1 -${10 * s} 10
    h -${44 * s}
    a ${10 * s} ${10 * s} 0 0 1 -${4 * s} -${14 * s}
    Z
  `;
};

function CloudStrip({ density, opacity }) {
  // Each strip renders the same cloud row twice end-to-end so the
  // keyframe (-50%) loops seamlessly.
  const clouds = Array.from({ length: density }, (_, i) => i);
  return (
    <div className="absolute inset-0 flex" style={{ width: "200%" }}>
      {[0, 1].map((dup) => (
        <svg
          key={dup}
          viewBox="0 0 1000 200"
          className="h-full w-1/2"
          preserveAspectRatio="none"
        >
          {clouds.map((i) => {
            const cx = (i / density) * 1000 + (i * 37) % 100;
            const cy = 30 + ((i * 53) % 140);
            const scale = 0.6 + ((i * 17) % 70) / 100;
            return (
              <path
                key={i}
                d={cloudPath(cx, cy, scale)}
                fill={`rgba(255,255,255,${opacity})`}
              />
            );
          })}
        </svg>
      ))}
    </div>
  );
}

export default function AviatorClouds({ moving }) {
  // Both layers always render — `moving` only toggles the animation
  // so the clouds visibly drift during flight, freeze during waiting.
  const slow = moving ? "animate-cloud-slow" : "";
  const fast = moving ? "animate-cloud-fast" : "";
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Far layer — soft, slower */}
      <div className={`absolute inset-0 ${slow}`} style={{ width: "200%" }}>
        <CloudStrip density={9} opacity={0.05} />
      </div>
      {/* Near layer — denser, faster */}
      <div className={`absolute inset-0 ${fast}`} style={{ width: "200%" }}>
        <CloudStrip density={6} opacity={0.10} />
      </div>
    </div>
  );
}
