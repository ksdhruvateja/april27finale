import { ArrowUpRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const data = [
  { v: 30 },
  { v: 45 },
  { v: 25 },
  { v: 60 },
  { v: 40 },
  { v: 70 },
  { v: 35 },
  { v: 55 },
  { v: 45 },
  { v: 65 },
];

export default function ScrapByMfgType() {
  return (
    <div className="glass-card p-4 flex-1 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-white/50 font-medium leading-tight">
          Scrap % by MFG<br />Type
        </p>
        <button className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/15 flex-shrink-0">
          <ArrowUpRight size={11} />
        </button>
      </div>

      <div>
        <p className="text-2xl font-bold text-white">0.06%</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: "#ef4444" }}>
          -0.62%/month
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(147,112,219,0.6)" />
                <stop offset="100%" stopColor="rgba(147,112,219,0.05)" />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke="rgba(147,112,219,0.8)"
              strokeWidth={2}
              fill="url(#areaGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
