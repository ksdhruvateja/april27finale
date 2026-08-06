import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Auth token injection ─────────────────────────────────────────────────────
// Intercept every /api/ fetch and attach the stored Bearer token.
// This avoids relying on httpOnly cookies which can be lost through proxy layers.
export const QB_TOKEN_KEY = "qb_auth_token";

const _baseFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  const isApi = rawUrl.includes("/api/") || rawUrl.endsWith("/api");
  if (isApi) {
    const token = localStorage.getItem(QB_TOKEN_KEY);
    if (token) {
      const headers = new Headers((init?.headers as HeadersInit | undefined) ?? {});
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      init = { ...init, headers, credentials: "include" };
      if (typeof input !== "string" && !(input instanceof URL)) {
        input = new Request(rawUrl, { ...input, headers, credentials: "include" });
      }
    }
  }
  return _baseFetch(input, init);
}) as typeof fetch;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

if (apiBaseUrl) {
	const nativeFetch = globalThis.fetch.bind(globalThis);
	const currentOrigin = globalThis.location?.origin;

	const withApiBase = (url: string): string => {
		if (url.startsWith("/api")) return `${apiBaseUrl}${url}`;
		if (currentOrigin && url.startsWith(`${currentOrigin}/api`)) {
			return `${apiBaseUrl}${url.slice(currentOrigin.length)}`;
		}
		return url;
	};

	globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
		const rawUrl =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		const url = withApiBase(rawUrl);
		const controller = new AbortController();
		const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
		const mergedInit: RequestInit = {
			...init,
			signal: init?.signal ?? controller.signal,
		};

		if (typeof input === "string" || input instanceof URL) {
			return nativeFetch(url, mergedInit).finally(() => globalThis.clearTimeout(timeout));
		}

		const nextRequest = new Request(url, input);
		return nativeFetch(nextRequest, mergedInit).finally(() => globalThis.clearTimeout(timeout));
	};
}

createRoot(document.getElementById("root")!).render(<App />);
