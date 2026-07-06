import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import { uploadSingleFile, uploadTextFile } from '../pages/files/filesApi'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('File upload (extracted from FilesPage.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads a file as multipart FormData to /api/v1/files/upload with the lane as a query param', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, file: { object_key: 'uploads/report.pdf' } }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['hello world'], 'report.pdf', { type: 'application/pdf' })
    const result = await uploadSingleFile(file, 'uploads')

    expect(result.file?.object_key).toBe('uploads/report.pdf')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/files/upload?lane=uploads')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('upload')).toBe(file)
  })

  it('defaults to the "uploads" lane when none is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, file: {} }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadSingleFile(new File(['x'], 'x.txt'), '')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/files/upload?lane=uploads')
  })

  it('rejects with an ApiError carrying the server-provided detail on upload failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'File exceeds the 25MB limit.' }, 413)),
    )

    const file = new File(['x'.repeat(10)], 'big.zip')
    await expect(uploadSingleFile(file, 'uploads')).rejects.toMatchObject({
      name: 'ApiError',
      status: 413,
      message: 'File exceeds the 25MB limit.',
    })
  })

  it('rejects with a network ApiError (status 0) when the upload request cannot reach the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(uploadSingleFile(new File(['x'], 'x.txt'), 'uploads')).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it('uploads successive files independently, so one failure does not corrupt a later success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Duplicate filename.' }, 409))
      .mockResolvedValueOnce(jsonResponse({ ok: true, file: { object_key: 'uploads/second.txt' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(uploadSingleFile(new File(['a'], 'first.txt'), 'uploads')).rejects.toMatchObject({
      status: 409,
    })
    const second = await uploadSingleFile(new File(['b'], 'second.txt'), 'uploads')
    expect(second.file?.object_key).toBe('uploads/second.txt')
  })

  it('uploadTextFile posts JSON with filename, content and lane', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, file: { object_key: 'uploads/note.txt' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadTextFile('note.txt', 'hello', 'uploads')

    expect(result.file?.object_key).toBe('uploads/note.txt')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/files/upload-text')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ filename: 'note.txt', content: 'hello', lane: 'uploads' })
  })
})
