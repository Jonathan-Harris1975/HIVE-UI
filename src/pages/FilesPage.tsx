import {
  FileArchive,
  FileText,
  FileUp,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import type { FileListResponse, FileObject } from '../types/api'

function fileKey(file: FileObject): string {
  return String(file.object_key || file.key || '')
}

function fileName(file: FileObject): string {
  const key = fileKey(file)
  return String(file.filename || file.original_name || key.split('/').pop() || key || 'Unnamed file')
}

function FileIcon({ name }: { name: string }) {
  return name.toLowerCase().endsWith('.zip')
    ? <FileArchive className="h-5 w-5" />
    : <FileText className="h-5 w-5" />
}

export function FilesPage() {
  const navigate = useNavigate()
  const { setPayload, setOpen } = useInspector()
  const [files, setFiles] = useState<FileObject[]>([])
  const [storage, setStorage] = useState('storage')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<FileListResponse>('/v1/files/list?prefix=uploads%2F&limit=200')
      if (!response.ok) throw new Error(response.message || response.error || 'File listing failed.')
      setFiles(response.files ?? [])
      setStorage(response.storage ?? 'storage')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Files could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return files
    return files.filter((file) => `${fileName(file)} ${fileKey(file)}`.toLowerCase().includes(needle))
  }, [files, query])

  async function uploadFile(file: File) {
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('upload', file)
    try {
      await apiFetch('/v1/files/upload', { method: 'POST', body: formData })
      await loadFiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function inspect(file: FileObject) {
    setPayload({
      eyebrow: 'File metadata',
      title: fileName(file),
      description: fileKey(file),
      rows: [
        { label: 'Storage', value: String(file.storage || storage) },
        { label: 'Size', value: formatBytes(Number(file.size_bytes ?? file.size ?? 0)) },
        { label: 'Content type', value: String(file.content_type || 'Unknown') },
        { label: 'Last modified', value: formatDate(String(file.last_modified || '')) },
      ],
      json: file,
    })
    setOpen(true)
  }

  function chatWith(file: FileObject) {
    const key = fileKey(file)
    navigate(`/chat?file=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName(file))}`)
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 shadow-xl shadow-black/10 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Shared file lane</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Bring evidence into the conversation</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Upload once, inspect the stored metadata, then open the file inside the same HIVE chat interface.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void loadFiles()} className="flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50">
                {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload file
              </button>
              <input ref={inputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stored files" className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
            </label>
            <div className="text-xs text-slate-600">{files.length} objects · {storage}</div>
          </div>
        </section>

        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <section className="mt-5">
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 py-16 text-center text-slate-600">
              <FileUp className="mx-auto h-8 w-8" />
              <p className="mt-3 text-sm">No matching files found.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((file) => {
                const key = fileKey(file)
                const name = fileName(file)
                return (
                  <article key={key} className="group rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                    <button type="button" onClick={() => inspect(file)} className="block w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/7 text-cyan-200"><FileIcon name={name} /></div>
                        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-600">{String(file.storage || storage)}</span>
                      </div>
                      <h3 className="mt-4 truncate text-sm font-semibold text-white">{name}</h3>
                      <p className="mt-1 line-clamp-2 min-h-10 break-all text-xs leading-5 text-slate-600">{key}</p>
                      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3 text-[11px] text-slate-600">
                        <span>{formatBytes(Number(file.size_bytes ?? file.size ?? 0))}</span>
                        <span>{formatDate(String(file.last_modified || ''))}</span>
                      </div>
                    </button>
                    <button type="button" onClick={() => chatWith(file)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/6 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/10">
                      <MessageSquareText className="h-4 w-4" /> Chat with file
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
