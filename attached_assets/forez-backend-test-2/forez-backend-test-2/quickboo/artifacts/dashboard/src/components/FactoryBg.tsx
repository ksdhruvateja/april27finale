import industrialBg from "@/assets/industrial_bg.png";

export default function FactoryBg() {
  return (
    <div className="fixed inset-0 z-0">
      <img
        src={industrialBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.78) saturate(1.05) hue-rotate(170deg)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(191,224,255,0.86) 0%, rgba(173,214,255,0.80) 35%, rgba(150,204,255,0.78) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 52% 48% at 4% 96%, rgba(81,164,255,0.32) 0%, transparent 52%),
            radial-gradient(ellipse 46% 42% at 95% 6%, rgba(133,193,255,0.30) 0%, transparent 48%),
            radial-gradient(ellipse 34% 36% at 78% 86%, rgba(105,177,255,0.22) 0%, transparent 45%)
          `,
        }}
      />
    </div>
  );
}
