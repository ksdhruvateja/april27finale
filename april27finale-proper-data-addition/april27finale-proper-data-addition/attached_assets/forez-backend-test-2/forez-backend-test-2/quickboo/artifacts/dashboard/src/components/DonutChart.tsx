import { PieChart, Pie, Cell } from "recharts";

const outerData = [
  { value: 100, color: "#c8ff00" },
];

const innerData = [
  { value: 100, color: "rgba(255,255,255,0.07)" },
];

export default function DonutChart() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="relative flex items-center justify-center">
        <PieChart width={150} height={150}>
          <Pie
            data={innerData}
            cx={70}
            cy={70}
            innerRadius={40}
            outerRadius={55}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
          >
            <Cell fill="rgba(255,255,255,0.07)" />
          </Pie>
          <Pie
            data={outerData}
            cx={70}
            cy={70}
            innerRadius={42}
            outerRadius={65}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
            paddingAngle={0}
          >
            <Cell fill="#c8ff00" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-white">100%</span>
          <span className="text-[10px] text-white/50 font-medium">Quality</span>
        </div>
      </div>

      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-lime flex-shrink-0" />
          <span className="text-[11px] text-white/60">Generic Time</span>
          <span className="ml-auto text-[11px] font-semibold text-white">21,711h</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0 border border-white/30 bg-black" />
          <span className="text-[11px] text-white/60">Injection Time</span>
          <span className="ml-auto text-[11px] font-semibold text-white">38,922h</span>
        </div>
      </div>
    </div>
  );
}
