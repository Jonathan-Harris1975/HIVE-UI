import { describe, expect, it } from 'vitest'
import {
  canChatWithObject,
  fileKey,
  fileName,
  laneLabel,
  laneStatus,
  responseMessage,
  rootPrefixForLane,
  selectedSourceForFile,
  selectionId,
} from '../pages/files/fileHelpers'
import type { R2Lane } from '../types/api'

describe('fileHelpers (extracted from FilesPage.tsx)', () => {
  it('fileKey prefers object_key, then key, then empty string', () => {
    expect(fileKey({ object_key: 'a/b.txt', key: 'legacy' })).toBe('a/b.txt')
    expect(fileKey({ key: 'legacy' })).toBe('legacy')
    expect(fileKey({})).toBe('')
  })

  it('fileName falls back through filename, original_name, then the key basename', () => {
    expect(fileName({ filename: 'report.pdf', object_key: 'uploads/report.pdf' })).toBe('report.pdf')
    expect(fileName({ original_name: 'orig.csv', object_key: 'uploads/x.csv' })).toBe('orig.csv')
    expect(fileName({ object_key: 'uploads/nested/data.json' })).toBe('data.json')
    expect(fileName({})).toBe('Unnamed file')
  })

  it('canChatWithObject recognises text-like extensions and content types', () => {
    expect(canChatWithObject({ object_key: 'a.md' })).toBe(true)
    expect(canChatWithObject({ object_key: 'a.bin', content_type: 'text/plain' })).toBe(true)
    expect(canChatWithObject({ object_key: 'a.docx' })).toBe(true)
    expect(canChatWithObject({ object_key: 'a.bin', content_type: 'application/octet-stream' })).toBe(false)
  })

  it('laneLabel humanises snake_case lane names', () => {
    expect(laneLabel({ lane: 'podcast_rss' } as R2Lane)).toBe('Podcast Rss')
    expect(laneLabel({ lane: 'uploads' } as R2Lane)).toBe('Uploads')
  })

  it('laneStatus reflects the most permissive matching state', () => {
    expect(laneStatus({ writable: true, readable: true } as R2Lane)).toEqual({
      status: 'active',
      label: 'Read/write',
    })
    expect(laneStatus({ writable: false, readable: true } as R2Lane)).toEqual({
      status: 'readonly',
      label: 'Read-only',
    })
    expect(laneStatus({ writable: false, readable: false, configured: true } as R2Lane)).toEqual({
      status: 'warning',
      label: 'Registry only',
    })
    expect(laneStatus({ writable: false, readable: false, configured: false } as R2Lane)).toEqual({
      status: 'unknown',
      label: 'Unavailable',
    })
  })

  it('rootPrefixForLane only applies "uploads/" to the primary upload lane', () => {
    expect(rootPrefixForLane({ primary_upload_lane: true } as R2Lane)).toBe('uploads/')
    expect(rootPrefixForLane({ primary_upload_lane: false } as R2Lane)).toBe('')
    expect(rootPrefixForLane(undefined)).toBe('')
  })


  it('responseMessage prefers structured API errors before falling back to the response message', () => {
    expect(responseMessage({ ok: false, error: 'Access denied' })).toBe('Access denied')
    expect(responseMessage({ ok: false, error: { message: 'Lane unavailable' } })).toBe('Lane unavailable')
    expect(responseMessage({ ok: false, message: 'Unable to list files' })).toBe('Unable to list files')
    expect(responseMessage({ ok: false })).toBe('File listing failed.')
  })

  it('selectionId produces a stable lane/object identifier', () => {
    expect(selectionId('uploads', 'nested/report.pdf')).toBe('uploads::nested/report.pdf')
  })

  it('selectedSourceForFile normalises the selected file for chat context', () => {
    expect(
      selectedSourceForFile('podcast_rss', {
        object_key: 'episodes/42/transcript.md',
        filename: 'episode-42.md',
      }),
    ).toEqual({
      lane: 'podcast_rss',
      object_key: 'episodes/42/transcript.md',
      name: 'episode-42.md',
    })
  })

})
