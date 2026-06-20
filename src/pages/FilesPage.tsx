import {
  ArrowLeft,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  UploadCloud,
  X,
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
import type {
  FileListResponse,
  FileMetadataResponse,
  FileObject,
  FileReadResponse,
  R2Lane,
  R2LanesResponse,
} from '../types/api'

type UploadMode = 'file' | 'text'

interface UploadResponse {
  ok?: boolean
  file?: FileObject
}

interface SkillFromFileResponse {
  ok?: boolean
  message?: string
  error_code?: string
}

const TEXT_CHAT_SUFFIXES = new Set([
  '.txt', '.md', '.log', '.json', '.jsonl', '.csv', '.tsv', '.html', '.htm', '.xml', '.rss',
  '.pdf', '.docx', '.xlsx', '.yaml', '.yml', '.py', '.js', '.ts', '.tsx', '.jsx', '.css', '.sql',
  '.sh', '.toml', '.ini', '.cfg',
])

function fileKey(file: FileObject): string {
  return String(file.object_key || file.key || '')
}

function fileName(file: FileObject): string {
  const key = fileKey(file)
  return String(file.filename || file.original_name || key.split('/').pop() || key || 'Unnamed file')
}

function extension(name: string): string {
  const lower = name.toLowerCase()
  const index = lower.lastIndexOf('.')
  return index >= 0 ? lower.slice(index) : ''
}

function canChatWithObject(file: FileObject): boolean {
  const contentType = String(file.content_type || '').toLowerCase()
  return TEXT_CHAT_SUFFIXES.has(extension(fileName(file)))
    || contentType.startsWith('text/')
    || ['json', 'xml', 'csv', 'pdf', 'wordprocessingml', 'spreadsheetml'].some((token) => contentType.includes(token))
}

function responseMessage(response: FileListResponse): string {
  if (typeof response.error === 'string') return response.error
  if (response.error?.message) return response.error.message
  return response.message || 'File listing failed.'
}

function laneLabel(lane: R2Lane): string {
  return lane.lane.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function laneStatus(lane: R2Lane): { status: string; label: string } {
  if (lane.writable) return { status: 'active', label: 'Read/write' }
  if (lane.readable) return { status: 'readonly', label: 'Read-only' }
  if (lane.configured) return { status: 'warning', label: 'Registry only' }
  return { status: 'unknown', label: 'Unavailable' }
}

function rootPrefixForLane(lane: R2Lane | undefined): string {
  return lane?.primary_upload_lane ? 'uploads/' : ''
}

function FileIcon({ name }: { name: string }) {
  const suffix = extension(name)
  if (suffix === '.zip') return <FileArchive className="h-5 w-5" />
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(suffix)) return <FileImage className="h-5 w-5" />
  return <FileText className="h-5 w-5" />
}

export function FilesPage() {
  const navigate = useNavigate()
  const { setPayload, setOpen } = useInspector()
  const [files, setFiles] = useState<FileObject[]>([])
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [lanes, setLanes] = useState<R2Lane[]>([])
  const [selectedLane, setSelectedLane] = useState('')
  const [prefix, setPrefix] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [lanesOpen, setLanesOpen] = useState(false)
  const [storage, setStorage] = useState('r2')
  const [loadingLanes, setLoadingLanes] = useState(true)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadMode, setUploadMode] = useState<UploadMode>('file')
  const [textFilename, setTextFilename] = useState('hive-note.txt')
  const [textContent, setTextContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const activeLane = useMemo(
    () => lanes.find((lane) => lane.lane === selectedLane),
    [lanes, selectedLane],
  )
  const readableLanes = useMemo(() => lanes.filter((lane) => lane.readable), [lanes])
  const configuredLaneCount = useMemo(() => lanes.filter((lane) => lane.configured).length, [lanes])

  const loadLanes = useCallback(async () => {
    setLoadingLanes(true)
    try {
      const response = await apiFetch<R2LanesResponse>('/v1/files/r2-lanes')
      const nextLanes = response.lanes ?? []
      setLanes(nextLanes)
      setSelectedLane((current) => {
        if (current && nextLanes.some((lane) => lane.lane === current && lane.readable)) return current
        return nextLanes.find((lane) => lane.primary_upload_lane && lane.readable)?.lane
          || nextLanes.find((lane) => lane.readable)?.lane
          || nextLanes.find((lane) => lane.configured)?.lane
          || ''
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The R2 lane registry could not be loaded.')
    } finally {
      setLoadingLanes(false)
    }
  }, [])

  const loadObjects = useCallback(async () => {
    if (!selectedLane || !activeLane?.readable) {
      setFiles([])
      setPrefixes([])
      setNextCursor(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ prefix, limit: '100' })
      if (currentCursor) params.set('cursor', currentCursor)
      if (activeSearch) params.set('search', activeSearch)
      const response = await apiFetch<FileListResponse>(`/v1/files/r2/${encodeURIComponent(selectedLane)}/objects?${params.toString()}`)
      if (!response.ok) throw new Error(responseMessage(response))
      setFiles(response.files ?? [])
      setPrefixes(response.prefixes ?? [])
      setStorage(response.storage ?? 'r2')
      setNextCursor(response.next_cursor ?? null)
    } catch (caught) {
      setFiles([])
      setPrefixes([])
      setNextCursor(null)
      setError(caught instanceof Error ? caught.message : 'Files could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeLane?.readable, activeSearch, currentCursor, prefix, selectedLane])

  useEffect(() => {
    void loadLanes()
  }, [loadLanes])

  useEffect(() => {
    const lane = lanes.find((item) => item.lane === selectedLane)
    if (!lane) return
    setPrefix((current) => current || rootPrefixForLane(lane))
  }, [lanes, selectedLane])

  useEffect(() => {
    void loadObjects()
  }, [loadObjects])

  const breadcrumbs = useMemo(() => {
    const root = rootPrefixForLane(activeLane)
    const relative = prefix.startsWith(root) ? prefix.slice(root.length) : prefix
    const parts = relative.split('/').filter(Boolean)
    return parts.map((part, index) => ({
      label: part,
      prefix: `${root}${parts.slice(0, index + 1).join('/')}/`,
    }))
  }, [activeLane, prefix])

  function selectLane(lane: R2Lane) {
    setSelectedLane(lane.lane)
    setPrefix(rootPrefixForLane(lane))
    setSearchInput('')
    setActiveSearch('')
    setCurrentCursor(null)
    setCursorHistory([])
    setNotice(null)
    setError(null)
  }

  function changePrefix(nextPrefix: string) {
    setPrefix(nextPrefix)
    setCurrentCursor(null)
    setCursorHistory([])
    setActiveSearch('')
    setSearchInput('')
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setActiveSearch(searchInput.trim())
    setCurrentCursor(null)
    setCursorHistory([])
  }

  function clearSearch() {
    setSearchInput('')
    setActiveSearch('')
    setCurrentCursor(null)
    setCursorHistory([])
  }

  function nextPage() {
    if (!nextCursor) return
    setCursorHistory((history) => [...history, currentCursor])
    setCurrentCursor(nextCursor)
  }

  function previousPage() {
    setCursorHistory((history) => {
      if (!history.length) return history
      const nextHistory = [...history]
      setCurrentCursor(nextHistory.pop() ?? null)
      return nextHistory
    })
  }

  async function uploadFiles(selected: File[]) {
    if (!selected.length || !activeLane?.writable) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const uploaded: FileObject[] = []
      for (const file of selected) {
        const formData = new FormData()
        formData.append('upload', file)
        const params = new URLSearchParams({ lane: selectedLane || 'uploads' })
        const response = await apiFetch<UploadResponse>(`/v1/files/upload?${params.toString()}`, { method: 'POST', body: formData })
        if (response.file) uploaded.push(response.file)
      }
      const readableKeys = uploaded.map((item) => fileKey(item)).filter(Boolean).slice(0, 2)
      setNotice(`${selected.length} file${selected.length === 1 ? '' : 's'} uploaded to ${laneLabel(activeLane)} with human-readable R2 keys${readableKeys.length ? `: ${readableKeys.join(', ')}` : '.'}`)
      setPrefix(rootPrefixForLane(activeLane))
      setCurrentCursor(null)
      setCursorHistory([])
      await loadObjects()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function uploadText(event: FormEvent) {
    event.preventDefault()
    if (!textFilename.trim() || !textContent.trim() || !activeLane?.writable) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<UploadResponse>('/v1/files/upload-text', {
        method: 'POST',
        body: JSON.stringify({
          filename: textFilename.trim(),
          content: textContent,
          content_type: 'text/plain; charset=utf-8',
          lane: selectedLane || 'uploads',
        }),
      })
      const key = response.file ? fileKey(response.file) : ''
      setNotice(`${textFilename.trim()} uploaded to ${laneLabel(activeLane)}${key ? ` as ${key}` : ''}.`)
      setTextContent('')
      setPrefix(rootPrefixForLane(activeLane))
      setCurrentCursor(null)
      setCursorHistory([])
      await loadObjects()
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

  async function inspect(file: FileObject) {
    const key = fileKey(file)
    setPayload({
      eyebrow: `${laneLabel(activeLane ?? { lane: selectedLane })} metadata`,
      title: fileName(file),
      description: key,
      rows: [{ label: 'Status', value: 'Loading authoritative R2 metadata…' }],
    })
    setOpen(true)
    try {
      const response = await apiFetch<FileMetadataResponse>(`/v1/files/r2/${encodeURIComponent(selectedLane)}/metadata?key=${encodeURIComponent(key)}`)
      const metadata = response.metadata ?? file
      setPayload({
        eyebrow: `${laneLabel(activeLane ?? { lane: selectedLane })} metadata`,
        title: fileName(metadata),
        description: fileKey(metadata),
        rows: [
          { label: 'Lane', value: selectedLane },
          { label: 'Access', value: response.access_mode || activeLane?.access_mode || 'Unknown' },
          { label: 'Bucket', value: String(metadata.bucket || activeLane?.bucket || 'Unknown') },
          { label: 'Size', value: formatBytes(Number(metadata.size_bytes ?? metadata.size ?? 0)) },
          { label: 'Content type', value: String(metadata.content_type || 'Unknown') },
          { label: 'Last modified', value: formatDate(String(metadata.last_modified || '')) },
          { label: 'Text preview', value: response.preview_supported ? 'Supported' : 'Download only' },
          { label: 'Chat', value: response.chat_supported ? 'Supported' : 'Unavailable for this object' },
        ],
        json: metadata,
      })
    } catch (caught) {
      setPayload({
        eyebrow: 'Metadata error',
        title: fileName(file),
        description: caught instanceof Error ? caught.message : 'Metadata could not be loaded.',
        json: file,
      })
    }
  }

  async function preview(file: FileObject) {
    const key = fileKey(file)
    setPayload({
      eyebrow: 'Text preview',
      title: fileName(file),
      description: `${selectedLane} · ${key}`,
      rows: [{ label: 'Status', value: 'Extracting a bounded preview…' }],
    })
    setOpen(true)
    try {
      const response = await apiFetch<FileReadResponse>(`/v1/files/r2/${encodeURIComponent(selectedLane)}/read?key=${encodeURIComponent(key)}&max_chars=40000`)
      setPayload({
        eyebrow: 'Text preview',
        title: fileName(response.file ?? file),
        description: `${selectedLane} · ${key}`,
        rows: [
          { label: 'Access', value: response.access_mode || activeLane?.access_mode || 'Unknown' },
          { label: 'Characters shown', value: String(response.content?.length ?? 0) },
        ],
        json: {
          preview: response.content ?? '',
          extraction: response.extraction ?? null,
          file: response.file ?? file,
        },
      })
    } catch (caught) {
      setPayload({
        eyebrow: 'Preview unavailable',
        title: fileName(file),
        description: caught instanceof Error ? caught.message : 'This object could not be previewed.',
      })
    }
  }

  function chatWith(file: FileObject) {
    const key = fileKey(file)
    navigate(`/chat?lane=${encodeURIComponent(selectedLane)}&file=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName(file))}`)
  }

  async function addSkillFromFile(file: FileObject) {
    const key = fileKey(file)
    if (!key) return
    setError(null)
    setNotice(null)
    try {
      const response = await apiFetch<SkillFromFileResponse>('/v1/skills/from-file', {
        method: 'POST',
        body: JSON.stringify({
          title: fileName(file),
          object_key: key,
          source_lane: selectedLane || 'uploads',
          description: `Skill registered from uploaded file ${fileName(file)}.`,
          repo: 'HIVE',
          hive_lane: 'uploaded-file-skills',
          priority_tier: 'P2',
          risk_level: 'medium',
          tags: ['uploaded-file', selectedLane || 'uploads'],
        }),
      })
      if (!response.ok) throw new Error(response.message || response.error_code || 'Skill registration failed.')
      setNotice(`${fileName(file)} has been added to the skill catalogue. Open Skills from the main menu to search or use it.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Skill registration failed.')
    }
  }

  const downloadHref = (file: FileObject) => `/api/v1/files/r2/${encodeURIComponent(selectedLane)}/download?key=${encodeURIComponent(fileKey(file))}`
  const viewHref = (file: FileObject) => `/api/v1/files/r2/${encodeURIComponent(selectedLane)}/view?key=${encodeURIComponent(fileKey(file))}`

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 shadow-xl shadow-black/10 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Authenticated R2 explorer</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Browse evidence across the HIVE ecosystem</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Every configured R2 lane can be browsed, uploaded to and opened inline when the server-side credentials allow it. Upload keys now keep readable filenames.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setLanesOpen((current) => !current)} aria-expanded={lanesOpen} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]">
                <Database className="h-4 w-4" /> Storage map
                <ChevronDown className={`h-3.5 w-3.5 transition ${lanesOpen ? 'rotate-180' : ''}`} />
              </button>
              <button type="button" onClick={() => { void loadLanes(); void loadObjects() }} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]">
                <RefreshCw className={`h-4 w-4 ${loading || loadingLanes ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>

          {lanesOpen && (
            <section className="mt-6 rounded-2xl border border-cyan-300/12 bg-[#071426]/75 p-4" aria-label="R2 ecosystem storage map">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Ecosystem storage map</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Select any readable lane to browse it. Writable lanes can receive uploads from this console.</p>
                </div>
                <StatusBadge status="active" label={`${readableLanes.length} readable · ${configuredLaneCount}/${lanes.length} configured`} compact />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lanes.map((lane) => {
                  const status = laneStatus(lane)
                  const selected = lane.lane === selectedLane
                  return (
                    <article key={lane.lane} className={`rounded-xl border p-3 transition ${selected ? 'border-cyan-300/30 bg-cyan-300/[0.055]' : 'border-white/8 bg-[#061126]/80'}`}>
                      <button type="button" disabled={!lane.readable} onClick={() => selectLane(lane)} className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-200">{laneLabel(lane)}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{lane.description || 'Configured ecosystem storage lane'}</p>
                          </div>
                          <StatusBadge status={status.status} label={status.label} compact />
                        </div>
                        <p className="mt-2 truncate text-[10px] text-slate-700">{lane.bucket || 'No bucket configured'}</p>
                      </button>
                      {lane.public_base_url && (
                        <a href={lane.public_base_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-cyan-300/70 hover:text-cyan-200">
                          Public base <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-4 border-t border-white/8 pt-5 lg:grid-cols-[minmax(220px,300px)_1fr]">
            <label className="text-xs font-medium text-slate-400">Storage lane
              <select
                value={selectedLane}
                disabled={loadingLanes}
                onChange={(event) => {
                  const lane = lanes.find((item) => item.lane === event.target.value)
                  if (lane) selectLane(lane)
                }}
                className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
              >
                {lanes.map((lane) => <option key={lane.lane} value={lane.lane} disabled={!lane.readable}>{laneLabel(lane)} · {laneStatus(lane).label}</option>)}
              </select>
            </label>

            <form onSubmit={submitSearch} className="self-end">
              <label className="text-xs font-medium text-slate-400">Search within {laneLabel(activeLane ?? { lane: selectedLane || 'storage' })}
                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                    <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search object names under the current prefix" className="h-11 w-full rounded-xl border border-white/8 bg-[#061126] pl-10 pr-10 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/30" />
                    {(searchInput || activeSearch) && <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-600 hover:bg-white/5 hover:text-slate-300" aria-label="Clear file search"><X className="h-4 w-4" /></button>}
                  </div>
                  <button type="submit" className="h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 text-xs font-medium text-cyan-100 hover:bg-cyan-300/12">Search</button>
                </div>
              </label>
            </form>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-[#061126]/70 px-3 py-2.5 text-xs text-slate-500">
            <button type="button" onClick={() => changePrefix(rootPrefixForLane(activeLane))} className="rounded-md px-2 py-1 text-cyan-200/80 hover:bg-white/5 hover:text-cyan-100">
              {laneLabel(activeLane ?? { lane: selectedLane || 'root' })}
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.prefix} className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-slate-700" />
                <button type="button" onClick={() => changePrefix(crumb.prefix)} className="max-w-[220px] truncate rounded-md px-2 py-1 hover:bg-white/5 hover:text-slate-300">{crumb.label}</button>
              </span>
            ))}
            {activeSearch && <span className="ml-auto rounded-full border border-cyan-300/15 bg-cyan-300/6 px-2.5 py-1 text-[10px] text-cyan-200">Search: {activeSearch}</span>}
          </div>

          {activeLane?.writable ? (
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
                  <p className="mt-3 text-sm font-medium text-slate-200">Drop one or more files into {laneLabel(activeLane)}</p>
                  <p className="mt-1 text-xs text-slate-600">HIVE will store them under readable date and filename based R2 keys.</p>
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
          ) : activeLane && (
            <div className="mt-6 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-cyan-100/70">
              This lane is not writable with the current credentials. HIVE can still browse, preview, view, download and chat with supported objects.
            </div>
          )}
        </section>

        {notice && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
        {error && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-2"><StatusBadge status={activeLane?.writable ? 'active' : activeLane?.readable ? 'readonly' : 'warning'} label={activeLane?.access_mode || storage} compact /> {files.length} objects · {prefixes.length} prefixes</div>
            <div className="flex items-center gap-2">
              {cursorHistory.length > 0 && <button type="button" onClick={previousPage} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Previous</button>}
              {nextCursor && <button type="button" onClick={nextPage} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-slate-400 hover:text-white">Next <ChevronRight className="h-3.5 w-3.5" /></button>}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]" />)}
            </div>
          ) : !activeLane?.readable ? (
            <div className="rounded-3xl border border-dashed border-amber-300/15 py-16 text-center text-amber-100/60">
              <Database className="mx-auto h-8 w-8" />
              <p className="mt-3 text-sm">This lane is configured as registry-only and cannot be browsed with the current credentials.</p>
            </div>
          ) : prefixes.length === 0 && files.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 py-16 text-center text-slate-600">
              <FolderOpen className="mx-auto h-8 w-8" />
              <p className="mt-3 text-sm">No matching objects found under this prefix.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {prefixes.map((folderPrefix) => {
                const clean = folderPrefix.replace(/\/$/, '')
                const name = clean.split('/').pop() || folderPrefix
                return (
                  <button key={folderPrefix} type="button" onClick={() => changePrefix(folderPrefix)} className="group rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/7 text-amber-200"><Folder className="h-5 w-5" /></div>
                    <h3 className="mt-4 truncate text-sm font-semibold text-white">{name}</h3>
                    <p className="mt-1 truncate text-xs text-slate-600">{folderPrefix}</p>
                    <div className="mt-4 flex items-center justify-end border-t border-white/6 pt-3 text-[11px] text-cyan-200/65">Open prefix <ChevronRight className="ml-1 h-3.5 w-3.5" /></div>
                  </button>
                )
              })}

              {files.map((file) => {
                const key = fileKey(file)
                const name = fileName(file)
                const chatSupported = Boolean(activeLane?.chat_supported && canChatWithObject(file))
                return (
                  <article key={key} className="group rounded-2xl border border-white/8 bg-[#0a192d]/70 p-4 transition hover:border-cyan-300/20 hover:bg-[#0d2038]">
                    <button type="button" onClick={() => void inspect(file)} className="block w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/7 text-cyan-200"><FileIcon name={name} /></div>
                        <StatusBadge status={activeLane?.writable ? 'active' : 'readonly'} label={activeLane?.writable ? 'Read/write' : 'Read-only'} compact />
                      </div>
                      <h3 className="mt-4 truncate text-sm font-semibold text-white">{name}</h3>
                      <p className="mt-1 line-clamp-2 min-h-10 break-all text-xs leading-5 text-slate-600">{key}</p>
                      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3 text-[11px] text-slate-600">
                        <span>{formatBytes(Number(file.size_bytes ?? file.size ?? 0))}</span>
                        <span>{formatDate(String(file.last_modified || ''))}</span>
                      </div>
                    </button>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => void preview(file)} disabled={!chatSupported} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
                        <FileText className="h-3.5 w-3.5" /> Preview
                      </button>
                      <a href={viewHref(file)} target="_blank" rel="noreferrer" className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a href={downloadHref(file)} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" disabled={!chatSupported} onClick={() => chatWith(file)} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/6 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-35">
                        <MessageSquareText className="h-4 w-4" /> {chatSupported ? 'Chat' : 'No chat'}
                      </button>
                      <button type="button" onClick={() => void addSkillFromFile(file)} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-violet-300/15 bg-violet-300/6 text-xs font-medium text-violet-100 transition hover:bg-violet-300/10">
                        <BrainCircuit className="h-4 w-4" /> Add skill
                      </button>
                    </div>
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
