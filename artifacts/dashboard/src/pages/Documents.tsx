import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Folder, File, FileText, Image, Search, Upload, Trash2, Eye, Star,
  Download, Edit2, X, Plus, Tag, Grid, List,
  FolderOpen, AlertCircle, Loader2, FilePlus2,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES = ["general", "invoices", "contracts", "images", "reports", "legal", "other"];

function fileIcon(mimeType: string, size = 16) {
  if (mimeType.startsWith("image/"))        return <Image size={size} className="text-pink-500" />;
  if (mimeType === "application/pdf")       return <FileText size={size} className="text-red-500" />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText size={size} className="text-blue-600" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel"))   return <FileText size={size} className="text-emerald-600" />;
  return <File size={size} className="text-slate-400" />;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreview(_mimeType: string) {
  return true; // every file gets the viewer; non-renderable types show a download CTA
}

function isImage(m: string)  { return m.startsWith("image/"); }
function isPdf(m: string)    { return m === "application/pdf"; }
function isText(m: string)   {
  return m.startsWith("text/") || ["application/json","application/xml","application/javascript","application/x-yaml"].includes(m);
}
function isOffice(m: string) {
  return m.includes("word") || m.includes("document") || m.includes("sheet") || m.includes("excel") || m.includes("powerpoint") || m.includes("presentation");
}

// ─── Full-screen document viewer ─────────────────────────────────────────────
function DocViewer({ doc, allDocs, onNavigate, onClose }: {
  doc: DocRecord;
  allDocs: DocRecord[];
  onNavigate: (d: DocRecord) => void;
  onClose: () => void;
}) {
  const url = `${BASE}/api/storage${doc.objectPath}`;
  const idx  = allDocs.findIndex(d => d.id === doc.id);
  const prev = idx > 0 ? allDocs[idx - 1] : null;
  const next = idx < allDocs.length - 1 ? allDocs[idx + 1] : null;

  const [zoom,        setZoom]        = useState(1);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  // Reset zoom when doc changes
  useEffect(() => { setZoom(1); setTextContent(null); }, [doc.id]);

  // Fetch text/JSON/CSV content
  useEffect(() => {
    if (!isText(doc.mimeType)) return;
    setTextLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(setTextContent)
      .catch(() => setTextContent("⚠ Could not load file content."))
      .finally(() => setTextLoading(false));
  }, [doc.id, url, doc.mimeType]);

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft"  && prev) onNavigate(prev);
      if (e.key === "ArrowRight" && next) onNavigate(next);
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.25, 4));
      if (e.key === "-")                  setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === "0")                  setZoom(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [prev, next, onClose, onNavigate]);

  const mimeLabel = doc.mimeType.split("/").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: "rgba(0,0,0,0.88)" }}>
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {fileIcon(doc.mimeType, 18)}
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{doc.name}</p>
            <p className="text-white/40 text-xs truncate">{doc.originalName} · {formatBytes(doc.size)}</p>
          </div>
          <span className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border border-white/15 text-white/50 ml-1">
            {mimeLabel}
          </span>
        </div>

        {/* Zoom controls — only for images */}
        {isImage(doc.mimeType) && (
          <div className="flex items-center gap-1 bg-white/8 rounded-xl px-2 py-1 border border-white/10">
            <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom out (−)"
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <ZoomOut size={14} />
            </button>
            <button onClick={() => setZoom(1)} title="Reset zoom (0)"
              className="px-2 py-0.5 rounded text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))} title="Zoom in (+)"
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <ZoomIn size={14} />
            </button>
            <button onClick={() => setZoom(z => z === 1 ? 2 : 1)} title="Fit / Full size"
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <Maximize2 size={13} />
            </button>
          </div>
        )}

        {/* Navigation counter */}
        {allDocs.length > 1 && (
          <span className="text-white/40 text-xs font-semibold flex-shrink-0">
            {idx + 1} / {allDocs.length}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a href={url} target="_blank" rel="noreferrer" title="Open in new tab"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs font-semibold hover:bg-white/15 hover:text-white transition-colors border border-white/10">
            <ExternalLink size={12} /> Open
          </a>
          <a href={url} download={doc.originalName} title="Download"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs font-semibold hover:bg-white/15 hover:text-white transition-colors border border-white/10">
            <Download size={12} /> Download
          </a>
          <button onClick={onClose} title="Close (Esc)"
            className="p-1.5 rounded-lg bg-white/8 text-white/60 hover:bg-white/15 hover:text-white transition-colors border border-white/10">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main viewer area */}
      <div className="flex flex-1 min-h-0 relative">

        {/* Prev arrow */}
        {prev && (
          <button
            onClick={() => onNavigate(prev)}
            title="Previous (←)"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/15 flex items-center justify-center transition-all group-hover:scale-110">
              <ChevronLeft size={20} className="text-white/70 group-hover:text-white" />
            </div>
            <span className="text-[9px] font-semibold text-white/30 group-hover:text-white/60 max-w-[80px] truncate text-center">{prev.name}</span>
          </button>
        )}

        {/* Content */}
        <div className="flex-1 flex items-center justify-center p-4 min-w-0 overflow-auto">
          {isImage(doc.mimeType) ? (
            <div
              className="transition-transform duration-200 origin-center cursor-zoom-in"
              style={{ transform: `scale(${zoom})` }}
              onClick={() => setZoom(z => z === 1 ? 2 : 1)}
            >
              <img
                src={url}
                alt={doc.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                style={{ display: "block" }}
              />
            </div>
          ) : isPdf(doc.mimeType) ? (
            <div className="w-full h-full flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>
              <iframe
                src={`${url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                title={doc.name}
                className="w-full flex-1 rounded-xl border border-white/10 shadow-2xl bg-white"
                style={{ minHeight: "calc(100vh - 140px)" }}
              />
            </div>
          ) : isText(doc.mimeType) ? (
            <div className="w-full max-w-4xl h-full overflow-auto rounded-2xl border border-white/10 shadow-2xl"
              style={{ background: "#0f172a", minHeight: "calc(100vh - 160px)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/8">
                <FileText size={13} className="text-indigo-400" />
                <span className="text-indigo-300 text-xs font-mono font-bold">{doc.originalName}</span>
              </div>
              {textLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : (
                <pre className="p-5 text-xs font-mono text-slate-200 leading-relaxed overflow-auto whitespace-pre-wrap break-words">
                  {textContent ?? ""}
                </pre>
              )}
            </div>
          ) : isOffice(doc.mimeType) ? (
            /* Office files — Google Docs viewer fallback */
            <div className="w-full h-full flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(`${window.location.origin}${url}`)}&embedded=true`}
                title={doc.name}
                className="w-full flex-1 rounded-xl border border-white/10 shadow-2xl bg-white"
                style={{ minHeight: "calc(100vh - 140px)" }}
              />
            </div>
          ) : (
            /* Fallback — can't render inline */
            <div className="flex flex-col items-center justify-center gap-6 text-center max-w-sm">
              <div className="w-20 h-20 rounded-3xl bg-white/8 border border-white/12 flex items-center justify-center">
                {fileIcon(doc.mimeType, 36)}
              </div>
              <div>
                <p className="text-white font-bold text-lg">{doc.name}</p>
                <p className="text-white/40 text-sm mt-1">{doc.originalName}</p>
                <p className="text-white/30 text-xs mt-0.5">{formatBytes(doc.size)}</p>
              </div>
              <p className="text-white/40 text-sm">This file type can't be previewed in the browser.</p>
              <a href={url} download={doc.originalName}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shadow-lg shadow-indigo-900/40">
                <Download size={16} /> Download File
              </a>
            </div>
          )}
        </div>

        {/* Next arrow */}
        {next && (
          <button
            onClick={() => onNavigate(next)}
            title="Next (→)"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/15 flex items-center justify-center transition-all group-hover:scale-110">
              <ChevronRight size={20} className="text-white/70 group-hover:text-white" />
            </div>
            <span className="text-[9px] font-semibold text-white/30 group-hover:text-white/60 max-w-[80px] truncate text-center">{next.name}</span>
          </button>
        )}
      </div>

      {/* Filmstrip — thumbnail strip at the bottom when >1 file */}
      {allDocs.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 overflow-x-auto border-t border-white/8 scrollbar-hide">
          {allDocs.map(d => {
            const active = d.id === doc.id;
            const thumbUrl = `${BASE}/api/storage${d.objectPath}`;
            return (
              <button
                key={d.id}
                onClick={() => onNavigate(d)}
                className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  active ? "border-indigo-400 scale-110 shadow-lg shadow-indigo-900/50" : "border-white/15 hover:border-white/40 opacity-60 hover:opacity-100"
                }`}
              >
                {isImage(d.mimeType) ? (
                  <img src={thumbUrl} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "#1e293b" }}>
                    {fileIcon(d.mimeType, 16)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DocRecord {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  objectPath: string;
  category: string | null;
  description: string | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function Documents() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch]         = useState("");
  const [category, setCategory]     = useState("all");
  const [view, setView]             = useState<"grid" | "list">("list");
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocRecord | null>(null);
  const [editDoc, setEditDoc]       = useState<DocRecord | null>(null);
  const [editName, setEditName]     = useState("");
  const [editDesc, setEditDesc]     = useState("");
  const [editCat, setEditCat]       = useState("general");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);

  const { data: docs, isLoading } = useQuery<DocRecord[]>({
    queryKey: ["documents", search, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category !== "all") params.set("category", category);
      const res = await fetch(`${BASE}/api/documents?${params}`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    staleTime: 30000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/documents/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const starMut = useMutation({
    mutationFn: async ({ id, starred }: { id: number; starred: boolean }) => {
      await fetch(`${BASE}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, name, description, category }: any) => {
      await fetch(`${BASE}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, category }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditDoc(null);
    },
  });

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploading(true);
    setUploadProgress({ name: file.name, pct: 0 });
    try {
      const res1 = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res1.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await res1.json();

      setUploadProgress({ name: file.name, pct: 30 });

      const res2 = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res2.ok) throw new Error("Upload to storage failed");

      setUploadProgress({ name: file.name, pct: 80 });

      await fetch(`${BASE}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, ""),
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          objectPath,
          category: "general",
          starred: false,
        }),
      });

      setUploadProgress({ name: file.name, pct: 100 });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(null);
      }, 600);
    }
  }, [queryClient]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  }, [uploadFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const filtered = useMemo(() => {
    if (!docs) return [];
    const s = search.toLowerCase();
    return docs.filter(d => {
      const matchCat = category === "all" || d.category === category;
      const matchS = !s || [d.name, d.originalName, d.description, d.category]
        .some(v => String(v ?? "").toLowerCase().includes(s));
      return matchCat && matchS;
    });
  }, [docs, search, category]);

  const starred = filtered.filter(d => d.starred);
  const unstarred = filtered.filter(d => !d.starred);

  const openPreview = useCallback((doc: DocRecord) => setPreviewDoc(doc), []);
  const allVisible  = useMemo(() => [...starred, ...unstarred], [starred, unstarred]);

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-0">
        <Header title="Documents" subtitle="Upload, store, and manage your files and documents" />

        <div className="flex flex-1 min-h-0 gap-0 overflow-hidden">

          {/* ── LEFT sidebar ──────────────────────────────────── */}
          <div className="w-48 flex-shrink-0 border-r border-slate-200/60 bg-white/40 flex flex-col py-4 px-3 gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-2">Categories</p>
            {["all", ...CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left w-full ${
                  category === cat
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cat === "all" ? <FolderOpen size={13} /> : <Folder size={13} />}
                <span className="capitalize">{cat === "all" ? "All Files" : cat}</span>
              </button>
            ))}
          </div>

          {/* ── MAIN content ──────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-hidden">

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search files by name, type, category…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
                />
              </div>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => setView("list")} title="List view"
                  className={`px-3 py-2 transition-colors ${view === "list" ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}>
                  <List size={15} />
                </button>
                <button onClick={() => setView("grid")} title="Grid view"
                  className={`px-3 py-2 transition-colors ${view === "grid" ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}>
                  <Grid size={15} />
                </button>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? "Uploading…" : "Upload Files"}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.pptx,.ppt"
                onChange={e => handleFiles(e.target.files)} />
            </div>

            {/* Upload progress */}
            {uploadProgress && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 flex-shrink-0">
                <Loader2 size={14} className="animate-spin text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-indigo-700 truncate">{uploadProgress.name}</p>
                  <div className="mt-1 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadProgress.pct}%` }} />
                  </div>
                </div>
                <span className="text-xs font-bold text-indigo-600">{uploadProgress.pct}%</span>
              </div>
            )}

            {/* Error banner */}
            {uploadError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex-shrink-0">
                <AlertCircle size={13} /> {uploadError}
                <button onClick={() => setUploadError(null)} className="ml-auto"><X size={12} /></button>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-shrink-0 border-2 border-dashed rounded-2xl px-6 py-5 flex items-center justify-center gap-3 cursor-pointer transition-all ${
                dragOver
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-400"
              }`}
            >
              <FilePlus2 size={20} />
              <span className="text-sm font-semibold">Drop files here or click to upload — PDF, images, Word, Excel &amp; more</span>
            </div>

            {/* Files list */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-slate-300" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  <Folder size={40} className="opacity-20" />
                  <p className="text-sm font-semibold">No files yet — upload something above</p>
                </div>
              ) : view === "list" ? (
                <div className="glass-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider w-9"></th>
                        <th className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider w-28">Category</th>
                        <th className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider w-20">Size</th>
                        <th className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider w-32">Uploaded</th>
                        <th className="px-4 py-3 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {starred.length > 0 && (
                        <tr className="bg-amber-50/50">
                          <td colSpan={6} className="px-4 py-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">★ Starred</span>
                          </td>
                        </tr>
                      )}
                      {allVisible.map(doc => (
                        <tr
                          key={doc.id}
                          className={`border-b border-slate-50 hover:bg-indigo-50/40 transition-colors group cursor-pointer ${doc.starred ? "bg-amber-50/20" : ""}`}
                          onClick={() => openPreview(doc)}
                        >
                          {/* Thumb / icon */}
                          <td className="px-4 py-2.5">
                            <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center bg-slate-50 flex-shrink-0">
                              {isImage(doc.mimeType)
                                ? <img src={`${BASE}/api/storage${doc.objectPath}`} alt="" className="w-full h-full object-cover" />
                                : fileIcon(doc.mimeType, 16)
                              }
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-800 text-sm truncate max-w-xs group-hover:text-indigo-700 transition-colors">{doc.name}</span>
                              {doc.description && <span className="text-xs text-slate-400 truncate max-w-xs">{doc.description}</span>}
                              <span className="text-[10px] text-slate-400 font-mono">{doc.originalName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                              <Tag size={9} /> {doc.category ?? "general"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatBytes(doc.size)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button title={doc.starred ? "Unstar" : "Star"}
                                onClick={() => starMut.mutate({ id: doc.id, starred: !doc.starred })}
                                className={`p-1.5 rounded-lg transition-colors ${doc.starred ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-400"}`}>
                                <Star size={13} fill={doc.starred ? "currentColor" : "none"} />
                              </button>
                              <button title="Open viewer" onClick={() => openPreview(doc)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                <Eye size={13} />
                              </button>
                              <a title="Download"
                                href={`${BASE}/api/storage${doc.objectPath}`}
                                download={doc.originalName}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <Download size={13} />
                              </a>
                              <button title="Edit"
                                onClick={() => { setEditDoc(doc); setEditName(doc.name); setEditDesc(doc.description ?? ""); setEditCat(doc.category ?? "general"); }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <Edit2 size={13} />
                              </button>
                              <button title="Delete"
                                onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteMut.mutate(doc.id); }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Grid view — real image thumbnails */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {allVisible.map(doc => {
                    const thumbUrl = `${BASE}/api/storage${doc.objectPath}`;
                    return (
                      <div key={doc.id}
                        className={`relative group rounded-2xl border bg-white flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden ${doc.starred ? "border-amber-200" : "border-slate-200"}`}
                        onClick={() => openPreview(doc)}
                      >
                        {/* Thumbnail area */}
                        <div className="relative h-36 bg-slate-50 flex items-center justify-center border-b border-slate-100 overflow-hidden">
                          {isImage(doc.mimeType) ? (
                            <img src={thumbUrl} alt={doc.name} className="w-full h-full object-cover" />
                          ) : isPdf(doc.mimeType) ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                                {fileIcon(doc.mimeType, 24)}
                              </div>
                              <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">PDF</span>
                            </div>
                          ) : isText(doc.mimeType) ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                                {fileIcon(doc.mimeType, 24)}
                              </div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">TEXT</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                                {fileIcon(doc.mimeType, 24)}
                              </div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                {doc.mimeType.split("/").pop()?.toUpperCase().slice(0, 6) ?? "FILE"}
                              </span>
                            </div>
                          )}
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/30 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-lg">
                              <Eye size={16} className="text-indigo-600" />
                            </div>
                          </div>
                          {doc.starred && (
                            <Star size={13} className="absolute top-2 right-2 text-amber-400 drop-shadow" fill="currentColor" />
                          )}
                        </div>

                        {/* Meta */}
                        <div className="p-3 flex flex-col gap-0.5 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate leading-snug group-hover:text-indigo-700 transition-colors">{doc.name}</p>
                          <p className="text-[10px] text-slate-400">{formatBytes(doc.size)} · {formatDate(doc.createdAt)}</p>
                          {doc.category && (
                            <span className="mt-1 self-start text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">{doc.category}</span>
                          )}
                        </div>

                        {/* Action strip */}
                        <div className="flex items-center gap-0.5 px-2 pb-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => starMut.mutate({ id: doc.id, starred: !doc.starred })} title={doc.starred ? "Unstar" : "Star"}
                            className={`p-1.5 rounded-lg transition-colors ${doc.starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
                            <Star size={12} fill={doc.starred ? "currentColor" : "none"} />
                          </button>
                          <a href={thumbUrl} download={doc.originalName} title="Download"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 transition-colors">
                            <Download size={12} />
                          </a>
                          <button onClick={() => { setEditDoc(doc); setEditName(doc.name); setEditDesc(doc.description ?? ""); setEditCat(doc.category ?? "general"); }} title="Edit"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 transition-colors">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteMut.mutate(doc.id); }} title="Delete"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 transition-colors ml-auto">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full-screen viewer ────────────────────────────── */}
      {previewDoc && (
        <DocViewer
          doc={previewDoc}
          allDocs={allVisible}
          onNavigate={setPreviewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* ── Edit modal ─────────────────────────────────────── */}
      {editDoc && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" onClick={() => setEditDoc(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              {fileIcon(editDoc.mimeType, 18)}
              <h2 className="text-slate-800 font-bold text-base">Edit Document</h2>
              <button onClick={() => setEditDoc(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Display Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-300 bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  rows={2} placeholder="Add a description…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 resize-none bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
                <select value={editCat} onChange={e => setEditCat(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-300 bg-white capitalize">
                  {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditDoc(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => editMut.mutate({ id: editDoc.id, name: editName.trim() || editDoc.name, description: editDesc, category: editCat })}
                disabled={editMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                {editMut.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
