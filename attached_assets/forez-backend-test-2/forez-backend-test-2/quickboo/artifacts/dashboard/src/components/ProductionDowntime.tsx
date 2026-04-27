import { ArrowUpRight } from "lucide-react";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis } from "recharts";

const data = [
  { name: "W1", val: 60 },
  { name: "W2", val: 90 },
  { name: "W3", val: 45 },
  { name: "W4", val: 75 },
  { name: "W5", val: 30 },
  { name: "W6", val: 85 },
  { name: "W7", val: 55 },
  { name: "W8", val: 100 },
  { name: "W9", val: 40 },
];

export default function ProductionDowntime() {
  return (
    <div className="glass-card p-4 flex-1 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-white/50 font-medium leading-tight">
          Production and Total<br />Downtime Hours
        </p>
        <button className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/15 flex-shrink-0">
          <ArrowUpRight size={11} />
        </button>
      </div>

      <div>
        <p className="text-2xl font-bold text-white">75.2%</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: "#c8ff00" }}>
          +12%/month
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={70}>
          <BarChart data={data} barCategoryGap="25%">
            <Bar dataKey="val" radius={[3, 3, 0, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={i % 2 === 0 ? "#c8ff00" : "rgba(147,112,219,0.6)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
