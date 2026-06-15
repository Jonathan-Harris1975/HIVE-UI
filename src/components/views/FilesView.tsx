import { useState, useCallback, useRef } from 'react'
import { files as filesApi } from '@/api/hive'
import type { HiveFile } from '@/types'
import { formatBytes, formatDate, cx } from '@/utils'
import { Spinner, EmptyState, ErrorBanner, Badge, InfoBanner } from '@/components/shared'

export function FilesView() {
  const [fileList, setFileList]   = useState<HiveFile[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [textContent, setTextContent] = useState('')
  const [textFilename, setTextFilename] = useState('')
  const [tab, setTab] = useState<'upload' | 'text'>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await filesApi.list(100)
      setFileList(res.files ?? [])
      setListLoaded(true)
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on first render
  useState(() => { loadFiles() })

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await filesApi.upload(file, true, false)
      setSuccess(`Uploaded: ${res.filename} (${formatBytes(res.size_bytes)}, ${res.chunk_count ?? 0} chunks)`)
      await loadFiles()
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [loadFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handleTextUpload = useCallback(async () => {
    if (!textContent.trim() || !textFilename.trim()) return
    setUploading(true)
    setError(null)
    try {
      const res = await filesApi.uploadText(textContent, textFilename)
      setSuccess(`Uploaded: ${res.filename}`)
      setTextContent('')
      setTextFilename('')
      await loadFiles()
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [textContent, textFilename, loadFiles])

  const handleVectorize = useCallback(async (objectKey: string) => {
    setError(null)
    try {
      const res = await filesApi.vectorize(objectKey)
      setSuccess(`Vectorized: ${res.upserted_count} chunks indexed`)
      await loadFiles()
    } catch (e: unknown) {
      const err = e as { detail?: string }
      setError(err?.detail ?? 'Vectorize failed')
    }
  }, [loadFiles])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-hive-border shrink-0">
        <h1 className="text-sm font-semibold text-hive-text">Files</h1>
        <button onClick={loadFiles} className="hive-btn-ghost text-xs">
          ↻ Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Upload panel */}
        <div className="w-80 border-r border-hive-border flex flex-col shrink-0 p-4 gap-4 overflow-y-auto">
          <div>
            <p className="hive-section-title mb-3">Upload</p>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-3 bg-hive-surfaceHi rounded-hive p-1">
              {(['upload', 'text'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx(
                    'flex-1 text-xs py-1 rounded transition-colors capitalize',
                    tab === t
                      ? 'bg-hive-surface text-hive-text border border-hive-border'
                      : 'text-hive-textDim hover:text-hive-textSoft',
                  )}
                >
                  {t === 'upload' ? '⬆ File' : '✎ Text'}
                </button>
              ))}
            </div>

            {tab === 'upload' ? (
              <>
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={cx(
                    'border-2 border-dashed rounded-hive p-6 text-center cursor-pointer transition-all',
                    dragging
                      ? 'border-hive-accent bg-hive-accentSoft'
                      : 'border-hive-border hover:border-hive-accent/50 hover:bg-hive-surfaceHi',
                    uploading && 'pointer-events-none opacity-60',
                  )}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Spinner />
                      <p className="text-xs text-hive-textDim">Uploading…</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl text-hive-textDim mb-1">⬆</p>
                      <p className="text-xs text-hive-textSoft">
                        Drop a file or click to browse
                      </p>
                      <p className="text-2xs text-hive-textDim mt-1">
                        PDF, DOCX, TXT, ZIP, XLSX supported
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
                  accept=".pdf,.docx,.txt,.md,.zip,.xlsx,.csv,.json"
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Filename (e.g. notes.txt)"
                  value={textFilename}
                  onChange={e => setTextFilename(e.target.value)}
                  className="hive-input text-xs mb-2"
                />
                <textarea
                  rows={8}
                  placeholder="Paste text content here…"
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  className="hive-input text-xs resize-none font-mono mb-2"
                />
                <button
                  onClick={handleTextUpload}
                  disabled={!textContent.trim() || !textFilename.trim() || uploading}
                  className="hive-btn-primary w-full justify-center py-1.5 disabled:opacity-50"
                >
                  {uploading ? <Spinner size="sm" /> : 'Upload Text'}
                </button>
              </>
            )}
          </div>

          {/* Feedback */}
          {error   && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {success && <InfoBanner message={success} variant="success" />}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && !listLoaded ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : fileList.length === 0 ? (
            <EmptyState
              icon="◱"
              title="No files uploaded yet"
              description="Upload a document to start using file-backed chat"
            />
          ) : (
            <div className="space-y-2">
              <p className="hive-section-title mb-3">{fileList.length} file{fileList.length !== 1 ? 's' : ''}</p>
              {fileList.map(file => (
                <FileCard
                  key={file.object_key}
                  file={file}
                  onVectorize={() => handleVectorize(file.object_key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── File card ──────────────────────────────────────────────────────────────
interface FileCardProps {
  file: HiveFile
  onVectorize: () => void
}

function FileCard({ file, onVectorize }: FileCardProps) {
  const filename = file.object_key.split('/').pop() ?? file.object_key
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const icon = EXT_ICONS[ext] ?? '◱'

  return (
    <div className="hive-card flex items-start gap-3">
      <span className="text-lg text-hive-textDim shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-hive-text truncate" title={file.object_key}>
          {filename}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-2xs text-hive-textDim">{formatBytes(file.size_bytes)}</span>
          {file.uploaded_at && (
            <>
              <span className="text-2xs text-hive-textDim">·</span>
              <span className="text-2xs text-hive-textDim">{formatDate(file.uploaded_at)}</span>
            </>
          )}
          {file.chunk_count !== undefined && (
            <>
              <span className="text-2xs text-hive-textDim">·</span>
              <span className="text-2xs text-hive-textDim">{file.chunk_count} chunks</span>
            </>
          )}
          {file.vectorized && (
            <Badge variant="success">vectorized</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!file.vectorized && (file.chunk_count ?? 0) > 0 && (
          <button
            onClick={onVectorize}
            title="Index for semantic search"
            className="text-2xs hive-btn-ghost px-2 py-1"
          >
            ⟡ index
          </button>
        )}
      </div>
    </div>
  )
}

const EXT_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', doc: '📝', txt: '◱', md: '◱',
  zip: '◫', xlsx: '⊞', csv: '⊞', json: '⟨⟩', py: '⟨⟩',
  js: '⟨⟩', ts: '⟨⟩', html: '⟨⟩',
}
