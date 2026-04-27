import { ArrowUpRight } from "lucide-react";

export default function OEEByMfgType() {
  return (
    <div className="glass-card p-5 flex-1 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/50 font-medium">OOE by MFG Type</p>
          <p className="text-3xl font-bold text-white mt-0.5">12.1%</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: "#ef4444" }}>
            -2.2%/month
          </p>
        </div>
        <button className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/15 transition-all">
          <ArrowUpRight size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2 mt-1">
        <BarRow label="Generic" values={[45, 55]} colors={["rgba(255,255,255,0.15)", "rgba(255,255,255,0.08)"]} />
        <BarRow label="Injective" values={[80, 20]} colors={["#111", "#c8ff00"]} />
      </div>

      <div className="flex items-center gap-4 mt-auto">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(255,255,255,0.15)" }} />
          <span className="text-xs text-white/60">Generic</span>
          <span className="text-xs text-white font-semibold ml-1">21,711h</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-black border border-white/10" />
          <span className="text-xs text-white/60">Injection</span>
          <span className="text-xs text-white font-semibold ml-1">38,922h</span>
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, values, colors }: { label: string; values: number[]; colors: string[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 flex-1 h-7 rounded-lg overflow-hidden">
        {values.map((v, i) => (
          <div
            key={i}
            className="h-full transition-all duration-500"
            style={{
              width: `${(v / total) * 100}%`,
              backgroundColor: colors[i],
            }}
          />
        ))}
      </div>
    </div>
  );
}
