import { z } from "zod";

export const ContactEntry = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
  email: z.string().optional(),
  number: z.string().optional(),
});

export function normalizeContactList(values: unknown[] | undefined, kind: "email" | "phone") {
  if (!Array.isArray(values)) return null;
  const normalized = values
    .map((entry) => {
      if (typeof entry === "string") {
        return kind === "email"
          ? { label: "Work", email: entry }
          : { label: "Mobile", number: entry };
      }
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === "string" ? e.label : kind === "email" ? "Work" : "Mobile";
      if (kind === "email") {
        const email = typeof e.email === "string" ? e.email : typeof e.value === "string" ? e.value : "";
        return email ? { label, email } : null;
      }
      const number = typeof e.number === "string" ? e.number : typeof e.value === "string" ? e.value : "";
      return number ? { label, number } : null;
    })
    .filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

export const contactEmailsField = z.array(z.union([z.string(), ContactEntry])).nullish();
export const contactPhonesField = z.array(z.union([z.string(), ContactEntry])).nullish();
