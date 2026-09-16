import { describe, expect, it } from 'vitest'
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
      lane: 'uploads',
      fileKey: 'uploads/a b&c.txt',
      fileDisplayName: 'a b&c.txt',
      skillId: 'skill-1',
      skillTitle: 'Formatter & Linter',
    })

    const params = new URLSearchParams(url.slice('/chat?'.length))
    expect(params.get('file')).toBe('uploads/a b&c.txt')
    expect(params.get('skill_title')).toBe('Formatter & Linter')
  })
})
