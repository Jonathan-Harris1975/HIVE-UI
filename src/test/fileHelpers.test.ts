import { describe, expect, it } from 'vitest'
import {
  canChatWithObject,
  defaultSkillForm,
  fileKey,
  fileName,
  laneLabel,
  laneStatus,
  rootPrefixForLane,
  skillField,
  skillIdentifier,
  skillItems,
  skillTitle,
  tagsFromInput,
} from '../pages/files/fileHelpers'
import type { FileObject, R2Lane, SkillItem } from '../types/api'

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
    expect(laneLabel({ lane: 'hive_skills' } as R2Lane)).toBe('Hive Skills')
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

  it('defaultSkillForm derives a clean title and tag set from the filename', () => {
    const file: FileObject = { object_key: 'uploads/My-Cool_Report.pdf' }
    const form = defaultSkillForm(file, 'uploads')
    expect(form.title).toBe('My Cool Report')
    expect(form.tags).toContain('uploaded-file')
    expect(form.tags).toContain('pdf')
    expect(form.riskLevel).toBe('medium')
  })

  it('tagsFromInput trims, dedupes empties, and caps at 20 tags', () => {
    expect(tagsFromInput('a, b ,, c')).toEqual(['a', 'b', 'c'])
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')
    expect(tagsFromInput(many)).toHaveLength(20)
  })

  it('skillItems reads from whichever of items/skills/results is populated', () => {
    const skill: SkillItem = { id: '1', title: 'Example' }
    expect(skillItems({ items: [skill] })).toEqual([skill])
    expect(skillItems({ skills: [skill] })).toEqual([skill])
    expect(skillItems({ results: [skill] })).toEqual([skill])
    expect(skillItems({})).toEqual([])
  })

  it('skillTitle and skillIdentifier fall back sensibly for unnamed skills', () => {
    expect(skillTitle({}, 2)).toBe('Skill 3')
    expect(skillTitle({ title: 'Named skill' })).toBe('Named skill')
    expect(skillIdentifier({ id: 'skill-1' })).toBe('skill-1')
    expect(skillIdentifier({}, 0)).toBe('Skill 1')
  })

  it('skillField reads top-level fields before metadata-nested fields', () => {
    expect(skillField({ repo: 'HIVE' }, 'repo')).toBe('HIVE')
    expect(skillField({ metadata: { repo: 'nested-repo' } }, 'repo')).toBe('nested-repo')
    expect(skillField({}, 'repo', 'fallback')).toBe('fallback')
  })
})
