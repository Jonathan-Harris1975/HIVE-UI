import { describe, expect, it } from 'vitest'
import { isHiveManagedR2Source } from '../lib/storagePolicy'

describe('HIVE storage policy', () => {
  it('excludes static delivery lanes and bucket names', () => {
    expect(isHiveManagedR2Source('art', 'podcastart')).toBe(false)
    expect(isHiveManagedR2Source('blog_images', 'blog-images')).toBe(false)
    expect(isHiveManagedR2Source('brand-assets', 'brand-assets')).toBe(false)
  })

  it('keeps operational and evidence lanes available', () => {
    expect(isHiveManagedR2Source('uploads', 'hive')).toBe(true)
    expect(isHiveManagedR2Source('blog', 'blog')).toBe(true)
    expect(isHiveManagedR2Source('podcast', 'podcast')).toBe(true)
    expect(isHiveManagedR2Source('transcripts', 'transcripts')).toBe(true)
  })
})
