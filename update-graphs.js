const fs = require('fs');
const path = './src/components/GameAnalysis.tsx';

let content = fs.readFileSync(path, 'utf8');

// 1. Add hoverPly state
content = content.replace(
  `const [activeTab, setActiveTab] = useState<"review" | "movetimes">("review");`,
  `const [activeTab, setActiveTab] = useState<"review" | "movetimes">("review");\n  const [hoverPly, setHoverPly] = useState<number | null>(null);`
);

// 2. Rewrite renderEvalGraph
const evalGraphRegex = /const renderEvalGraph = \(\) => \{[\s\S]*?return \([\s\S]*?<\/div>\s*\);\s*\};/;
const newEvalGraph = `const renderEvalGraph = () => {
    if (!analysis || analysis.moves.length === 0) return null;

    const width = 1000;
    const height = 120;
    const midY = height / 2;
    const clampEval = (cp: number) => Math.max(-500, Math.min(500, cp));
    const evalToY = (cp: number) => midY - (clampEval(cp) / 500) * midY;

    const points = analysis.moves.map((m, i) => {
      const x = (i / Math.max(1, analysis.moves.length - 1)) * width;
      const y = evalToY(m.evalAfter);
      return { x, y, classification: m.classification, ply: i };
    });

    const lineD = points.map((p, i) => \`\${i === 0 ? "M" : "L"} \${p.x} \${p.y}\`).join(" ");
    const whiteFillD = \`M 0 \${midY} \` + points.map((p) => \`L \${p.x} \${Math.min(p.y, midY)}\`).join(" ") + \` L \${width} \${midY} Z\`;
    const blackFillD = \`M 0 \${midY} \` + points.map((p) => \`L \${p.x} \${Math.max(p.y, midY)}\`).join(" ") + \` L \${width} \${midY} Z\`;

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const ply = Math.round(ratio * Math.max(1, analysis.moves.length - 1));
      setHoverPly(Math.max(0, Math.min(analysis.moves.length - 1, ply)));
    };

    const hoveredPoint = hoverPly !== null ? points[hoverPly] : null;

    return (
      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-input)] group">
        <svg 
          viewBox={\`0 0 \${width} \${height}\`} 
          className="w-full cursor-crosshair" 
          preserveAspectRatio="none" 
          style={{ height: 120 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPly(null)}
          onClick={() => hoverPly !== null && onMoveClick?.(hoverPly)}
        >
          <rect x="0" y="0" width={width} height={midY} fill="rgba(241,245,249,0.05)" />
          <rect x="0" y={midY} width={width} height={midY} fill="rgba(0,0,0,0.15)" />
          <path d={whiteFillD} fill="rgba(241,245,249,0.25)" />
          <path d={blackFillD} fill="rgba(30,30,30,0.5)" />
          <line x1="0" y1={midY} x2={width} y2={midY} stroke="var(--border)" strokeWidth="1" strokeDasharray="6 3" />
          <path d={lineD} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          
          {points.filter(p => p.classification === "blunder" || p.classification === "mistake").map(p => (
            <circle key={p.ply} cx={p.x} cy={p.y} r="5" fill={CLASSIFICATION_COLORS[p.classification]} stroke="var(--bg-card)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}

          {activePly !== undefined && activePly >= 0 && activePly < points.length && (
            <line x1={points[activePly].x} y1="0" x2={points[activePly].x} y2={height} stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
          )}

          {hoveredPoint && (
            <line x1={hoveredPoint.x} y1="0" x2={hoveredPoint.x} y2={height} stroke="white" strokeWidth="1" strokeOpacity="0.8" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {hoveredPoint && (
          <div 
            className="absolute top-2 px-2 py-1 bg-[#1a1a1a] text-white text-[10px] rounded shadow-lg pointer-events-none transform -translate-x-1/2"
            style={{ left: \`\${(hoveredPoint.ply / Math.max(1, analysis.moves.length - 1)) * 100}%\` }}
          >
            CP: {(analysis.moves[hoveredPoint.ply].evalAfter / 100).toFixed(2)}
          </div>
        )}
      </div>
    );
  };`;
content = content.replace(evalGraphRegex, newEvalGraph);

// 3. Rewrite MoveTimesChart function completely
const moveTimesChartRegex = /function MoveTimesChart\([\s\S]*?\}\n\}/;
const newMoveTimesChart = `function MoveTimesChart({ moves, activePly, onMoveClick }: { moves: Array<{ moveTime?: number }>, activePly?: number, onMoveClick?: (ply: number) => void }) {
  const [hoverPly, setHoverPly] = useState<number | null>(null);
  
  if (moves.length === 0) return null;
  const times = moves.map(m => m.moveTime ?? 0);
  const maxTime = Math.max(...times, 1);
  const width = 1000;
  const height = 120;
  
  const getX = (i: number) => (i / Math.max(1, moves.length - 1)) * width;
  const getY = (t: number) => height - (t / maxTime) * height;

  const points = times.map((t, i) => ({ x: getX(i), y: getY(t), time: t, ply: i }));
  const lineD = points.map((p, i) => \`\${i === 0 ? "M" : "L"} \${p.x} \${p.y}\`).join(" ");
  const fillD = \`M 0 \${height} \` + points.map((p) => \`L \${p.x} \${p.y}\`).join(" ") + \` L \${width} \${height} Z\`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const ply = Math.round(ratio * Math.max(1, moves.length - 1));
    setHoverPly(Math.max(0, Math.min(moves.length - 1, ply)));
  };

  const hoveredPoint = hoverPly !== null ? points[hoverPly] : null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h4 className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] text-center mb-2">
        Move Times
      </h4>
      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-input)]">
        <svg 
          viewBox={\`0 0 \${width} \${height}\`} 
          className="w-full cursor-crosshair" 
          preserveAspectRatio="none" 
          style={{ height: 120 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPly(null)}
          onClick={() => hoverPly !== null && onMoveClick?.(hoverPly)}
        >
          <path d={fillD} fill="rgba(255,152,0,0.15)" />
          <path d={lineD} fill="none" stroke="#ff9800" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          
          {/* Reference lines */}
          {[1, 5, 10, 30].filter(t => t < maxTime).map(t => {
            const y = getY(t);
            return (
              <g key={t}>
                <line x1="0" y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                <text x="5" y={y - 4} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="sans-serif">{t}s</text>
              </g>
            );
          })}

          {activePly !== undefined && activePly >= 0 && activePly < points.length && (
            <line x1={points[activePly].x} y1="0" x2={points[activePly].x} y2={height} stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
          )}

          {hoveredPoint && (
            <line x1={hoveredPoint.x} y1="0" x2={hoveredPoint.x} y2={height} stroke="white" strokeWidth="1" strokeOpacity="0.8" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {hoveredPoint && (
          <div 
            className="absolute top-2 px-2 py-1 bg-[#1a1a1a] text-white text-[10px] rounded shadow-lg pointer-events-none transform -translate-x-1/2"
            style={{ left: \`\${(hoveredPoint.ply / Math.max(1, moves.length - 1)) * 100}%\` }}
          >
            {hoveredPoint.time.toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
}`;

content = content.replace(moveTimesChartRegex, newMoveTimesChart);

fs.writeFileSync(path, content);
console.log("Updated graphs.");
