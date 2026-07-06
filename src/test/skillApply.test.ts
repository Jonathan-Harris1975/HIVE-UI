import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSkillApplyChatUrl } from '../pages/files/filesApi'

describe('Skill review-and-apply (extracted from FilesPage.tsx)', () => {
  it('builds a /chat URL carrying the file source, skill id, and a prefilled draft', () => {
    const url = buildSkillApplyChatUrl({
      lane: 'uploads',
      fileKey: 'uploads/2026/report.pdf',
      fileDisplayName: 'report.pdf',
      skillId: 'skill-42',
      skillTitle: 'Repository QA Reviewer',
    })

    expect(url.startsWith('/chat?')).toBe(true)
    const params = new URLSearchParams(url.slice('/chat?'.length))
    expect(params.get('lane')).toBe('uploads')
    expect(params.get('file')).toBe('uploads/2026/report.pdf')
    expect(params.get('skill_id')).toBe('skill-42')
    expect(params.get('skill_title')).toBe('Repository QA Reviewer')
    expect(params.get('draft')).toBe('Use Repository QA Reviewer with this file: ')

    const sources = JSON.parse(params.get('sources') ?? '[]')
    expect(sources).toEqual([
      { lane: 'uploads', object_key: 'uploads/2026/report.pdf', name: 'report.pdf' },
    ])
  })

  it('URL-encodes special characters in the file name and skill title safely', () => {
    const url = buildSkillApplyChatUrl({
      lane: 'hive_skills',
      fileKey: 'skills/a b&c.txt',
      fileDisplayName: 'a b&c.txt',
      skillId: 'skill-1',
      skillTitle: 'Formatter & Linter',
    })

    const params = new URLSearchParams(url.slice('/chat?'.length))
    expect(params.get('file')).toBe('skills/a b&c.txt')
    expect(params.get('skill_title')).toBe('Formatter & Linter')
  })
})

describe('Skill-from-file registration API contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts the expected shape to /v1/skills/from-file', async () => {
    const { apiFetch } = await import('../lib/api')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/v1/skills/from-file', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Formatter',
        object_key: 'uploads/formatter.py',
        source_lane: 'uploads',
        description: 'Skill registered from uploaded file formatter.py.',
        repo: 'HIVE',
        hive_lane: 'uploaded-file-skills',
        priority_tier: 'P2',
        risk_level: 'medium',
        tags: ['uploaded-file', 'uploads', 'py'],
      }),
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/skills/from-file')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ title: 'Formatter', repo: 'HIVE', risk_level: 'medium' })
  })
})
