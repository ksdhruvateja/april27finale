import { useEffect, useRef } from "react";

/** On-screen preview uses the same HTML as Print / PDF (forez-template). */
export default function ForezDocumentPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;

    const resize = () => {
      try {
        const doc = el.contentDocument;
        if (!doc?.body) return;
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        el.style.height = `${Math.max(h + 24, 600)}px`;
      } catch {
        /* cross-origin guard — should not happen with srcDoc */
      }
    };

    el.addEventListener("load", resize);
    resize();
    return () => el.removeEventListener("load", resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Document preview"
      srcDoc={html}
      className="w-full max-w-[8.5in] mx-auto border-0 bg-white block shadow-sm"
      style={{ minHeight: 600 }}
    />
  );
}
