const kpis = [
  { value: "38.7%", label: "OEE Actual", color: "#ef4444" },
  { value: "40.8%", label: "Availability Actual", color: "#c8ff00" },
  { value: "94.9%", label: "Performance Actual", color: "#c8ff00" },
  { value: "46,202", label: "Production Hours", color: "transparent" },
  { value: "99,550", label: "Total Good Parts", color: "#c8ff00" },
  { value: "0.06%", label: "Scrap", color: "#c8ff00" },
];

export default function KPICards() {
  return (
    <div className="glass-card px-5 py-4">
      <div className="grid grid-cols-3 gap-x-3 gap-y-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {k.color !== "transparent" && (
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: k.color }}
                />
              )}
              <span className="text-sm font-bold text-white leading-none">
                {k.value}
              </span>
            </div>
            <span className="text-[10px] text-white/50 leading-tight">{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
