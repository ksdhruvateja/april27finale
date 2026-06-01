import { LightFormField, LightFormInput } from "./Modal";

type Field = { key: string; label: string; placeholder?: string; type?: string };

export function QuickBooksFieldsSection({
  fields,
  values,
  onChange,
}: {
  fields: Field[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
        QuickBooks (import fields)
      </p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <LightFormField key={f.key} label={f.label}>
            <LightFormInput
              type={f.type ?? "text"}
              step={f.type === "number" ? "0.01" : undefined}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          </LightFormField>
        ))}
      </div>
    </div>
  );
}

export function parseQbExtras(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v != null && v !== "") out[k] = String(v);
  }
  return out;
}

export function qbExtrasFromForm(form: Record<string, string>) {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(form)) {
    const t = v.trim();
    if (!t) continue;
    if (k === "openBalance") {
      const n = Number(t.replace(/[$,]/g, ""));
      out[k] = Number.isFinite(n) ? n : t;
    } else {
      out[k] = t;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
