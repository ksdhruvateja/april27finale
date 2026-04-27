import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useRole, CurrentUser, UserRole, CustomPermissions, checkAccess } from "@/context/RoleContext";
import { UserCircle2, Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";

const ALL_PATHS = [
  "/", "/customers", "/quotes", "/invoices", "/sales-leads",
  "/vendors", "/purchase-orders", "/bills",
  "/products", "/shipments",
  "/tax-rates", "/accounting", "/banking",
  "/users", "/settings",
];
const FALLBACK_DEV_EMAIL = "developer@gmail.com";
const FALLBACK_DEV_PASSWORD = "developer143";

function firstAccessiblePath(role: UserRole, customPermissions?: CustomPermissions): string {
  return ALL_PATHS.find(p => checkAccess(role, p, customPermissions)) ?? "/";
}

export default function UserSelectModal() {
  const { currentUser, setCurrentUser } = useRole();
  const [, navigate] = useLocation();

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  if (currentUser) return null;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (email.trim().toLowerCase() === FALLBACK_DEV_EMAIL && password === FALLBACK_DEV_PASSWORD) {
          const user: CurrentUser = {
            id: 0,
            email: FALLBACK_DEV_EMAIL,
            name: "Developer",
            role: "developer",
          };
          setCurrentUser(user);
          navigate(firstAccessiblePath(user.role));
          return;
        }
        setError((data as { error?: string }).error ?? "Login failed.");
        return;
      }

      let customPermissions: CustomPermissions | undefined;
      if (data.role === "custom" && data.customPermissions) {
        try { customPermissions = JSON.parse(data.customPermissions); } catch {}
      }

      const user: CurrentUser = {
        id:    data.id,
        email: data.email,
        name:  data.name ?? undefined,
        role:  data.role as UserRole,
        customPermissions,
      };
      setCurrentUser(user);
      navigate(firstAccessiblePath(user.role, customPermissions));
    } catch {
      if (email.trim().toLowerCase() === FALLBACK_DEV_EMAIL && password === FALLBACK_DEV_PASSWORD) {
        const user: CurrentUser = {
          id: 0,
          email: FALLBACK_DEV_EMAIL,
          name: "Developer",
          role: "developer",
        };
        setCurrentUser(user);
        navigate(firstAccessiblePath(user.role));
        return;
      }
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#d9ecff]/60 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl p-8 bg-[#eaf5ff]/90 border border-[#bfdcf7] shadow-[0_24px_80px_rgba(54,122,194,0.22)] backdrop-blur-xl">
        {/* Header */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_8px_20px_rgba(59,130,246,0.35)]">
            <UserCircle2 size={24} color="#fff" />
          </div>
          <h2 className="text-[20px] font-black leading-none tracking-[-0.02em] text-slate-800">
            Sign In
          </h2>
          <p className="text-[12.5px] font-semibold mt-1.5 text-center text-slate-500">
            Enter your credentials to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
              Email
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
              />
              <input
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl pl-9 pr-4 py-3 text-[13px] font-semibold bg-white/90 border border-[#c6def5] text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
              Password
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
              />
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl pl-9 pr-10 py-3 text-[13px] font-semibold bg-white/90 border border-[#c6def5] text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 rounded-xl text-[12px] font-bold bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[14px] font-black text-white mt-1 transition-all hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_8px_20px_rgba(59,130,246,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn size={16} />
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Default credentials hint */}
        <p className="text-center text-[11px] font-semibold mt-5 text-slate-500">
          Default: developer@gmail.com · developer143
        </p>
      </div>
    </div>
  );
}
