import Layout from "@/components/Layout";
import Header from "@/components/Header";

export default function Settings() {
  return (
    <Layout>
      <Header title="Settings" />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6 bg-[hsl(220_25%_97%)]">
        <div className="glass-card p-8 max-w-2xl mx-auto">
          <h2 className="text-slate-800 text-xl font-bold mb-1">Company Settings</h2>
          <p className="text-slate-500 text-sm mb-6">Manage your FoREZCorp workspace preferences, billing, and team members.</p>

          <div className="flex flex-col gap-0 rounded-xl border border-slate-200 overflow-hidden">
            {[
              { title: "Company Profile",  desc: "Update company name, logo, and contact info.", action: "Edit" },
              { title: "Team Members",     desc: "Invite users and manage roles.",               action: "Manage" },
              { title: "Billing & Plan",   desc: "Manage your subscription and payment methods.", action: "Upgrade" },
            ].map((row, i, arr) => (
              <div key={row.title} className={`flex items-center justify-between px-5 py-4 bg-white ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div>
                  <h3 className="text-slate-800 font-medium text-sm">{row.title}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{row.desc}</p>
                </div>
                <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                  {row.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
