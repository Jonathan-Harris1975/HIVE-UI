import {
  ChevronDown,
  Database,
  ExternalLink,
  FileArchive,
  FileText,
  FileUp,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { StatusBadge } from '../components/StatusBadge'
import { useInspector } from '../context/InspectorContext'
import { apiFetch } from '../lib/api'
import { formatBytes, formatDate } from '../lib/format'
import type { FileListResponse, FileObject, R2Lane, R2LanesResponse } from '../types/api'

type UploadMode = 'file' | 'text'

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
  const [lanes, setLanes] = useState<R2Lane[]>([])
  const [lanesOpen, setLanesOpen] = useState(false)
  const [storage, setStorage] = useState('storage')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadMode, setUploadMode] = useState<UploadMode>('file')
  const [textFilename, setTextFilename] = useState('hive-note.txt')
  const [textContent, setTextContent] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fileResponse, laneResponse] = await Promise.all([
        apiFetch<FileListResponse>('/v1/files/list?prefix=uploads%2F&limit=200'),
        apiFetch<R2LanesResponse>('/v1/files/r2-lanes').catch(() => ({ ok: false, lanes: [] })),
      ])
      if (!fileResponse.ok) throw new Error(fileResponse.message || fileResponse.error || 'File listing failed.')
      setFiles(fileResponse.files ?? [])
      setStorage(fileResponse.storage ?? 'storage')
      setLanes(laneResponse.lanes ?? [])
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

  const configuredLaneCount = useMemo(() => lanes.filter((lane) => lane.configured).length, [lanes])

  async function uploadFiles(selected: File[]) {
    if (!selected.length) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      for (const file of selected) {
        const formData = new FormData()
        formData.append('upload', file)
        await apiFetch('/v1/files/upload', { method: 'POST', body: formData })
      }
      setNotice(`${selected.length} file${selected.length === 1 ? '' : 's'} uploaded successfully.`)
      await loadFiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function uploadText(event: FormEvent) {
    event.preventDefault()
    if (!textFilename.trim() || !textContent.trim()) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch('/v1/files/upload-text', {
        method: 'POST',
        body: JSON.stringify({
          filename: textFilename.trim(),
          content: textContent,
          content_type: 'text/plain; charset=utf-8',
        }),
      })
      setNotice(`${textFilename.trim()} uploaded successfully.`)
      setTextContent('')
      await loadFiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Text upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    void uploadFiles(Array.from(event.dataTransfer.files))
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Shared file lane</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Bring evidence into the conversation</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Upload files or paste text, inspect stored metadata, then open the source inside the same HIVE chat interface.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lanes.length > 0 && (
                <button type="button" onClick={() => setLanesOpen((current) => !current)} aria-expanded={lanesOpen} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]">
                  <Database className="h-4 w-4" /> Storage map
                  <ChevronDown className={`h-3.5 w-3.5 transition ${lanesOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button type="button" onClick={() => void loadFiles()} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>

          {lanesOpen && lanes.length > 0 && (
            <section className="mt-6 rounded-2xl border border-cyan-300/12 bg-[#071426]/75 p-4" aria-label="R2 ecosystem storage map">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Ecosystem storage map</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">The uploads lane is active for file operations. Other configured buckets are registry-aware only, ready for a later scoped read-access phase.</p>
                </div>
                <StatusBadge status="active" label={`${configuredLaneCount}/${lanes.length} configured`} compact />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lanes.map((lane) => (
                  <article key={lane.lane} className="rounded-xl border border-white/8 bg-[#061126]/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-200">{lane.lane.replace(/_/g, ' ')}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{lane.description || 'Configured ecosystem storage lane'}</p>
                      </div>
                      <StatusBadge
                        status={lane.primary_upload_lane ? 'active' : lane.configured ? 'readonly' : 'unknown'}
                        label={lane.primary_upload_lane ? 'Read/write' : lane.configured ? 'Registry only' : 'Not configured'}
                        compact
                      />
                    </div>
                    {lane.public_base_url && (
                      <a href={lane.public_base_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-cyan-300/70 hover:text-cyan-200">
                        Public base <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="mt-6 border-t border-white/8 pt-5">
            <div className="flex w-fit gap-1 rounded-xl border border-white/8 bg-[#071426] p-1">
              <button type="button" onClick={() => setUploadMode('file')} className={`rounded-lg px-3 py-1.5 text-xs transition ${uploadMode === 'file' ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-500 hover:text-slate-300'}`}>File upload</button>
              <button type="button" onClick={() => setUploadMode('text')} className={`rounded-lg px-3 py-1.5 text-xs transition ${uploadMode === 'text' ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-500 hover:text-slate-300'}`}>Paste text</button>
            </div>

            {uploadMode === 'file' ? (
              <div
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }}
                onDrop={handleDrop}
                className={`mt-4 rounded-2xl border border-dashed p-6 text-center transition ${dragActive ? 'border-cyan-300/45 bg-cyan-300/[0.06]' : 'border-white/10 bg-[#071426]/70'}`}
              >
                {uploading ? <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-cyan-300" /> : <UploadCloud className="mx-auto h-8 w-8 text-cyan-300/70" />}
                <p className="mt-3 text-sm font-medium text-slate-200">Drop one or more files here</p>
                <p className="mt-1 text-xs text-slate-600">ZIPs, documents, text, spreadsheets and other formats supported by HIVE ingestion.</p>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50">
                  <FileUp className="h-4 w-4" /> Choose files
                </button>
                <input ref={inputRef} multiple type="file" className="hidden" onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))} />
              </div>
            ) : (
              <form onSubmit={uploadText} className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-[#071426]/70 p-4">
                <label className="text-xs font-medium text-slate-400">Filename
                  <input value={textFilename} onChange={(event) => setTextFilename(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30" />
                </label>
                <label className="text-xs font-medium text-slate-400">Text content
                  <textarea value={textContent} onChange={(event) => setTextContent(event.target.value)} rows={7} placeholder="Paste notes, logs, transcripts or source text…" className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-[#061126] px-3 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
                </label>
                <div className="flex justify-end">
                  <button type="submit" disabled={uploading || !textFilename.trim() || !textContent.trim()} className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50">
                    {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Upload text
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stored files" className="h-10 w-full rounded-xl border border-white/8 bg-[#071426] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
            </label>
            <div className="flex items-center gap-2 text-xs text-slate-600"><StatusBadge status={storage === 'r2' ? 'active' : 'readonly'} label={storage} compact /> {files.length} objects</div>
          </div>
        </section>

        {notice && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
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
                        <StatusBadge status={String(file.storage || storage)} label={String(file.storage || storage)} compact />
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
