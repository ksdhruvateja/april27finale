import { useState, useEffect } from "react";

export interface CompanyProfile {
  name: string;
  tagline: string;
  line1: string;
  line2: string;   // "city, state zip" joined
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;  // base64 data-URL or null → fall back to default logo
}

export const COMPANY_DEFAULTS: CompanyProfile = {
  name:    "Forez Corp",
  tagline: "Industrial & Commercial Supplies",
  line1:   "2402 Ocean Ave",
  line2:   "Ronkonkoma, NY 11779",
  city:    "Ronkonkoma",
  state:   "NY",
  zip:     "11779",
  phone:   "+1 (516) 860-2513",
  email:   "info@forezcorp.com",
  website: "www.forezcorp.com",
  logo:    null,
};

// Module-level cache so all components share one fetch
let _cache: CompanyProfile | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export function invalidateCompanyProfileCache() {
  _cache = null;
  _cacheTime = 0;
}

export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  try {
    const r = await fetch("/api/app-settings");
    if (!r.ok) return COMPANY_DEFAULTS;
    const d = await r.json();
    const city  = d.company_city  || COMPANY_DEFAULTS.city;
    const state = d.company_state || COMPANY_DEFAULTS.state;
    const zip   = d.company_zip   || COMPANY_DEFAULTS.zip;
    _cache = {
      name:    d.company_name    || COMPANY_DEFAULTS.name,
      tagline: d.company_tagline || COMPANY_DEFAULTS.tagline,
      line1:   d.company_address || COMPANY_DEFAULTS.line1,
      line2:   [city, state ? `${state}${zip ? " " + zip : ""}` : zip].filter(Boolean).join(", ") || COMPANY_DEFAULTS.line2,
      city, state, zip,
      phone:   d.company_phone   || COMPANY_DEFAULTS.phone,
      email:   d.company_email   || COMPANY_DEFAULTS.email,
      website: d.company_website || COMPANY_DEFAULTS.website,
      logo:    d.company_logo    || null,
    };
    _cacheTime = Date.now();
    return _cache;
  } catch {
    return COMPANY_DEFAULTS;
  }
}

/** React hook — returns the profile and re-renders once loaded. */
export function useCompanyProfile(): CompanyProfile {
  const [profile, setProfile] = useState<CompanyProfile>(_cache ?? COMPANY_DEFAULTS);
  useEffect(() => {
    fetchCompanyProfile().then(setProfile);
  }, []);
  return profile;
}
