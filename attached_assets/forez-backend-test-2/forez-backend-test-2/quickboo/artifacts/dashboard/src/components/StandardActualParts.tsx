import { ArrowUpRight } from "lucide-react";

const circles = [
  { size: 44, color: "rgba(147,112,219,0.5)", x: 20, y: 10 },
  { size: 36, color: "rgba(147,112,219,0.35)", x: 52, y: 20 },
  { size: 28, color: "rgba(147,112,219,0.25)", x: 78, y: 28 },
  { size: 32, color: "rgba(255,255,255,0.12)", x: 30, y: 52 },
  { size: 24, color: "rgba(255,255,255,0.08)", x: 62, y: 55 },
  { size: 20, color: "rgba(255,255,255,0.06)", x: 85, y: 58 },
];

export default function StandardActualParts() {
  return (
    <div className="glass-card p-4 flex-1 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-white/50 font-medium leading-tight">
          Standart and<br />Actual Parts
        </p>
        <button className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/15 flex-shrink-0">
          <ArrowUpRight size={11} />
        </button>
      </div>

      <div>
        <p className="text-2xl font-bold text-white">62.1%</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: "#ef4444" }}>
          -8.3%/month
        </p>
      </div>

      <div className="flex-1 relative min-h-[60px]">
        {circles.map((c, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: c.size,
              height: c.size,
              backgroundColor: c.color,
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
