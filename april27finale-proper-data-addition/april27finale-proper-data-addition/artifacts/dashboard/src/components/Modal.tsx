import { ArrowLeft, X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  placement?: "center" | "right";
  panelWidth?: string;
  theme?: "dark" | "light";
  lightMode?: boolean;
}

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = "max-w-3xl",
  placement = "center",
  panelWidth = "w-full",
  theme = "dark",
  lightMode = false,
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (theme === "light") {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        <div
          className={`relative z-10 ${maxWidth} w-full flex flex-col rounded-2xl shadow-2xl max-h-[90vh]`}
          style={{ background: "#ffffff", border: "1px solid rgba(226,232,240,1)" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #e2e8f0" }}>
            <div>
              <h2 className="font-bold text-[15px] leading-tight text-slate-800">{title}</h2>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && (
            <div className="flex-shrink-0" style={{ borderTop: "1px solid #e2e8f0" }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (placement === "right") {
    return (
      <div
        className="fixed inset-0 z-[70] flex justify-end"
        style={{ background: "rgba(10,8,5,0.84)", backdropFilter: "blur(10px)" }}
      >
        <div
          className={`${panelWidth} h-full flex flex-col`}
          style={{
            background: "rgba(10,8,5,0.97)",
            borderLeft: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "-20px 0 48px rgba(0,0,0,0.35)",
          }}
        >
          <div
            className="flex-shrink-0 flex items-center gap-3 px-6 py-4"
            style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.09)" }}
          >
            <button
              onClick={onClose}
              className="flex items-center gap-2 transition-colors text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#ffffff"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="w-px h-5" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div>
              <h2 className="font-bold text-[15px] leading-tight" style={{ color: "#ffffff" }}>{title}</h2>
              {subtitle && <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className={`${maxWidth} mx-auto px-6 py-8`}>
              {children}
            </div>
          </div>

          {footer && (
            <div
              className="flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.04)", borderTop: "1px solid rgba(255,255,255,0.09)" }}
            >
              <div className={`${maxWidth} mx-auto`}>
                {footer}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (lightMode) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col"
        style={{ background: "linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 40%, #f8faff 100%)" }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-6 py-4"
          style={{ background: "rgba(255,255,255,0.80)", borderBottom: "1px solid #cbd5e1", backdropFilter: "blur(8px)" }}
        >
          <button
            onClick={onClose}
            className="flex items-center gap-2 transition-colors text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <div>
            <h2 className="font-bold text-[15px] leading-tight text-slate-800">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className={`${maxWidth} mx-auto px-6 py-8`}>
            {children}
          </div>
        </div>

        {footer && (
          <div
            className="flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.90)", borderTop: "1px solid #cbd5e1", backdropFilter: "blur(8px)" }}
          >
            <div className={`${maxWidth} mx-auto`}>
              {footer}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: "rgba(10,8,5,0.97)", backdropFilter: "blur(16px)" }}
    >
      <div
        className="flex-shrink-0 flex items-center gap-3 px-6 py-4"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.09)" }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 transition-colors text-sm font-medium"
          style={{ color: "rgba(255,255,255,0.55)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#ffffff"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="w-px h-5" style={{ background: "rgba(255,255,255,0.12)" }} />
        <div>
          <h2 className="font-bold text-[15px] leading-tight" style={{ color: "#ffffff" }}>{title}</h2>
          {subtitle && <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className={`${maxWidth} mx-auto px-6 py-8`}>
          {children}
        </div>
      </div>

      {footer && (
        <div
          className="flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", borderTop: "1px solid rgba(255,255,255,0.09)" }}
        >
          <div className={`${maxWidth} mx-auto`}>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

export function FormField({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.50)" }}>
        {label}{required && <span className="ml-0.5" style={{ color: "#f87171" }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{hint}</p>}
    </div>
  );
}

export function LightFormField({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function FormInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors ${className}`}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#ffffff",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function LightFormInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors text-slate-800 placeholder:text-slate-400 focus:border-blue-400 ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function FormSelect({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors ${className}`}
      style={{
        background: "rgba(30,25,20,0.95)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#ffffff",
        ...(props.style ?? {}),
      }}
    >
      {children}
    </select>
  );
}

export function LightFormSelect({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors text-slate-800 focus:border-blue-400 ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        ...(props.style ?? {}),
      }}
    >
      {children}
    </select>
  );
}

export function FormTextarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors resize-none ${className}`}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#ffffff",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function LightFormTextarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors resize-none text-slate-800 placeholder:text-slate-400 focus:border-blue-400 ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        ...(props.style ?? {}),
      }}
    />
  );
}

export function SubmitBar({ onClose, isLoading, label = "Create", formId, hideClose }: { onClose: () => void; isLoading: boolean; label?: string; formId?: string; hideClose?: boolean }) {
  return (
    <div className="flex gap-3 px-6 py-4">
      {!hideClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" }}
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        form={formId}
        disabled={isLoading}
        className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 hover:scale-[1.01]"
        style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}
      >
        {isLoading ? "Saving..." : label}
      </button>
    </div>
  );
}

export function LightSubmitBar({ onClose, isLoading, label = "Create", formId, hideClose }: { onClose: () => void; isLoading: boolean; label?: string; formId?: string; hideClose?: boolean }) {
  return (
    <div className="flex gap-3 px-6 py-4">
      {!hideClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        form={formId}
        disabled={isLoading}
        className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 hover:scale-[1.01]"
        style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}
      >
        {isLoading ? "Saving..." : label}
      </button>
    </div>
  );
}
