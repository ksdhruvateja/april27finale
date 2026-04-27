import { ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts";

const data = [
  { name: "Jan", injective: 37.1, generic: 45.2 },
  { name: "Feb", injective: 58.5, generic: 45.2 },
  { name: "Mar", injective: 77.2, generic: 30 },
];

export default function OEETrendChart() {
  return (
    <div className="glass-purple p-5 flex-1 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/60 font-medium">OOE Trend Average Annual</p>
          <p className="text-3xl font-bold text-white mt-0.5">14.7%</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: "#ef4444" }}>
            -12%/year
          </p>
        </div>
        <button className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all">
          <ArrowUpRight size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={data} barCategoryGap="30%" barGap={2}>
            <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Bar dataKey="generic" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill="rgba(255,255,255,0.25)" />
              ))}
            </Bar>
            <Bar dataKey="injective" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={i === 2 ? "#c8ff00" : "rgba(200,255,0,0.5)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-4 flex-wrap">
        {data.map((d, i) => (
          <div key={d.name} className="flex flex-col">
            <span className="text-xs text-white/60">{d.name === "Jan" ? "Injective" : d.name === "Feb" ? "Generic" : "Injective"}</span>
            <div className="flex items-end gap-1">
              <span className="text-sm font-bold text-white">{d.injective}%</span>
            </div>
            <span className="text-xs text-white/50">{d.name === "Jan" ? "Generic" : d.name === "Feb" ? "Injective" : "Generic"}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {[
          { label: "37.1%", sub: "Injective" },
          { label: "45.2%", sub: "Generic" },
          { label: "58.5%", sub: "Generic" },
          { label: "77.2%", sub: "Injective" },
        ].map((item, i) => (
          <div key={i} className="flex flex-col">
            <span className="text-sm font-bold text-white">{item.label}</span>
            <span className="text-[10px] text-white/55">{item.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
