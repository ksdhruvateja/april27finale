import { useState, useRef, useMemo, useCallback } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Folder, File, FileText, Image, Search, Upload, Trash2, Eye, Star,
  Download, Edit2, X, Plus, Tag, Grid, List, ChevronDown,
  FolderOpen, AlertCircle, CheckCircle2, Loader2, FilePlus2,
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

function canPreview(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function resolveUploadUrl(uploadURL: string): string {
  if (/^https?:\/\//i.test(uploadURL)) return uploadURL;
  const path = uploadURL.startsWith("/") ? uploadURL : `/${uploadURL}`;
  return `${BASE}${path}`;
}

function docDownloadUrl(id: number) {
  return `${BASE}/api/documents/${id}/download`;
}

function docPreviewUrl(id: number) {
  return `${BASE}/api/documents/${id}/preview`;
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
      const res = await fetch(`${BASE}/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Delete failed");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e: any) => setUploadError(e?.message ?? "Could not delete file"),
  });

  const starMut = useMutation({
    mutationFn: async ({ id, starred }: { id: number; starred: boolean }) => {
      const res = await fetch(`${BASE}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      });
      if (!res.ok) throw new Error("Could not update star");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e: any) => setUploadError(e?.message ?? "Could not update file"),
  });

  const editMut = useMutation({
    mutationFn: async ({ id, name, description, category }: any) => {
      const res = await fetch(`${BASE}/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, category }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Save failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditDoc(null);
    },
    onError: (e: any) => setUploadError(e?.message ?? "Could not save changes"),
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
      if (!res1.ok) {
        const err = await res1.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not get upload URL");
      }
      const { uploadURL, objectPath } = await res1.json();

      setUploadProgress({ name: file.name, pct: 30 });

      const res2 = await fetch(resolveUploadUrl(uploadURL), {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res2.ok) throw new Error("File upload failed — please try again");

      setUploadProgress({ name: file.name, pct: 80 });

      const res3 = await fetch(`${BASE}/api/documents`, {
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
      if (!res3.ok) {
        const err = await res3.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save document record");
      }

      setUploadProgress({ name: file.name, pct: 100 });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (e: any) {
      setUploadError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, [queryClient]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
    // Reset so the same file(s) can be re-uploaded if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  const previewUrl = previewDoc ? docPreviewUrl(previewDoc.id) : null;

  return (
    <Layout>
      <div className="page-shell flex flex-col flex-1 min-h-0 h-0 overflow-hidden">
        <Header title="Documents" subtitle="Upload, store, and manage your files and documents" />

        <div className="flex flex-1 min-h-0 h-0 gap-0 overflow-hidden">

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
            <div className="data-table-scroll flex-1 min-h-0 overflow-y-auto">
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
                      {[...starred, ...unstarred].map(doc => (
                        <tr key={doc.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors group ${doc.starred ? "bg-amber-50/20" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center">
                              {fileIcon(doc.mimeType)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-800 text-sm truncate max-w-xs">{doc.name}</span>
                              {doc.description && (
                                <span className="text-xs text-slate-400 truncate max-w-xs">{doc.description}</span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">{doc.originalName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                              <Tag size={9} /> {doc.category ?? "general"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatBytes(doc.size)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button title={doc.starred ? "Unstar" : "Star"}
                                onClick={() => starMut.mutate({ id: doc.id, starred: !doc.starred })}
                                className={`p-1.5 rounded-lg transition-colors ${doc.starred ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-400"}`}>
                                <Star size={13} fill={doc.starred ? "currentColor" : "none"} />
                              </button>
                              {canPreview(doc.mimeType) && (
                                <button title="Preview" onClick={() => setPreviewDoc(doc)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                  <Eye size={13} />
                                </button>
                              )}
                              <a title="Download"
                                href={docDownloadUrl(doc.id)}
                                download={doc.originalName}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                onClick={e => e.stopPropagation()}>
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
                /* Grid view */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {[...starred, ...unstarred].map(doc => (
                    <div key={doc.id}
                      className={`relative group rounded-2xl border bg-white p-4 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer ${doc.starred ? "border-amber-200 bg-amber-50/20" : "border-slate-200"}`}
                      onClick={() => canPreview(doc.mimeType) ? setPreviewDoc(doc) : undefined}
                    >
                      {doc.starred && <Star size={11} className="absolute top-2 right-2 text-amber-400" fill="currentColor" />}
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                        {fileIcon(doc.mimeType, 20)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate leading-snug">{doc.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(doc.size)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
                        {canPreview(doc.mimeType) && (
                          <button onClick={e => { e.stopPropagation(); setPreviewDoc(doc); }}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors"><Eye size={12} /></button>
                        )}
                        <a href={docDownloadUrl(doc.id)} download={doc.originalName}
                          onClick={e => e.stopPropagation()}
                          className="p-1 rounded text-slate-400 hover:text-emerald-600 transition-colors"><Download size={12} /></a>
                        <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${doc.name}"?`)) deleteMut.mutate(doc.id); }}
                          className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors ml-auto"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview modal ──────────────────────────────────── */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-[200] flex flex-col" onClick={() => setPreviewDoc(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 flex flex-col h-full max-w-5xl mx-auto w-full p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {fileIcon(previewDoc.mimeType, 18)}
                <div>
                  <p className="text-white font-bold text-sm">{previewDoc.name}</p>
                  <p className="text-white/50 text-xs">{previewDoc.originalName} · {formatBytes(previewDoc.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={docDownloadUrl(previewDoc.id)} download={previewDoc.originalName}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors">
                  <Download size={13} /> Download
                </a>
                <button onClick={() => setPreviewDoc(null)}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
              {previewDoc.mimeType.startsWith("image/") ? (
                <img src={previewUrl} alt={previewDoc.name} className="w-full h-full object-contain" />
              ) : (
                <iframe src={previewUrl} title={previewDoc.name} className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
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
