/**
 * Cover art: guaranteed-distinct cards without any image-generation provider.
 * Guards the two behaviours that fixed the catalog: the fallback no longer
 * points at the web-dev mascot, and the poster stays legible for long titles.
 */
import { describe, expect, it } from 'vitest'
import { composeCourseCover, wrapTitle, COVER_H, COVER_W } from '@/lib/courses/course-cover'
import { effectiveCourseCover, resolveCourseCover } from '@/lib/courses/course-images'

describe('effectiveCourseCover', () => {
  it('keeps a real poster', () => {
    expect(effectiveCourseCover({ id: 'x', title: 'Java', image: 'https://cdn/x.png' })).toBe('https://cdn/x.png')
  })

  it('uses the subject art when the subject actually matched', () => {
    const java = { id: 'java-beginner', title: 'Java Fundamentals', tags: ['Java', 'beginner'] }
    expect(resolveCourseCover(java)).toBe('/courses/java.jpg')
    expect(effectiveCourseCover(java)).toBe('/courses/java.jpg')
  })

  it('renders a per-course cover instead of the web fallback', () => {
    for (const title of ['Mechanical Engineering Intermediate', 'Electrical Engineering Advanced', 'Civil Engineering Basics']) {
      const course = { id: title.toLowerCase().replace(/\s+/g, '-'), title, category: 'Engineering', tags: ['Engineering'] }
      expect(resolveCourseCover(course)).toBe('/courses/web.jpg') // the old, wrong answer
      expect(effectiveCourseCover(course)).toBe(`/api/courses/${course.id}/cover`)
    }
  })
})

describe('wrapTitle', () => {
  it('keeps short titles on one line at the largest size', () => {
    expect(wrapTitle('SQL Advanced')).toEqual({ lines: ['SQL Advanced'], fontSize: 72 })
  })

  it('never produces more than three lines, shrinking for long titles', () => {
    const long = 'PostgreSQL Query Optimisation and Integrity for Data Engineers and Analysts'
    const { lines, fontSize } = wrapTitle(long)
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(fontSize).toBeLessThanOrEqual(72)
    expect(lines.join(' ')).toContain('PostgreSQL')
  })

  it('collapses whitespace so the SVG never gets a blank line', () => {
    expect(wrapTitle('  Java   Fundamentals  ').lines).toEqual(['Java Fundamentals'])
  })
})

describe('composeCourseCover', () => {
  it('renders a real 1200x675 JPEG', async () => {
    const buf = await composeCourseCover({ id: 'mech', title: 'Mechanical Engineering Intermediate', level: 'intermediate', category: 'Engineering', tags: ['Engineering'] })
    expect(buf.length).toBeGreaterThan(10_000)
    expect(buf.subarray(0, 2).toString('hex')).toBe('ffd8') // JPEG SOI
    // Dimensions live in SOF0; just assert the buffer is a valid image via sharp.
    const sharp = (await import('sharp')).default
    const meta = await sharp(buf).metadata()
    expect([meta.width, meta.height]).toEqual([COVER_W, COVER_H])
  })
})
