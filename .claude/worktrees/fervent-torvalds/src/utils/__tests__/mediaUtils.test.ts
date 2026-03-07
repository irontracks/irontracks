import { parseExt, guessMediaKind, extFromMime, mediaKindFromUrl } from '../mediaUtils'

describe('mediaUtils', () => {
  describe('parseExt', () => {
    it('extracts valid extensions', () => {
      expect(parseExt('video.mp4')).toBe('.mp4')
      expect(parseExt('IMAGE.JPG')).toBe('.jpg') // Case insensitive
      expect(parseExt('my.story.webm')).toBe('.webm')
    })

    it('returns empty string for invalid extensions', () => {
      expect(parseExt('file.exe')).toBe('')
      expect(parseExt('script.js')).toBe('')
      expect(parseExt('no_extension')).toBe('')
    })
  })

  describe('guessMediaKind', () => {
    it('identifies video from mime', () => {
      expect(guessMediaKind('video/mp4', '')).toBe('video')
      expect(guessMediaKind('video/webm', '')).toBe('video')
    })

    it('identifies image from mime', () => {
      expect(guessMediaKind('image/jpeg', '')).toBe('image')
      expect(guessMediaKind('image/png', '')).toBe('image')
    })

    it('identifies video from extension', () => {
      expect(guessMediaKind('', '.mp4')).toBe('video')
      expect(guessMediaKind('', '.mov')).toBe('video')
    })

    it('identifies image from extension', () => {
      expect(guessMediaKind('', '.jpg')).toBe('image')
      expect(guessMediaKind('', '.png')).toBe('image')
    })

    it('returns unknown for unsupported types', () => {
      expect(guessMediaKind('application/pdf', '.pdf')).toBe('unknown')
    })
  })

  describe('extFromMime', () => {
    it('maps mime to extension', () => {
      expect(extFromMime('video/mp4')).toBe('.mp4')
      expect(extFromMime('image/jpeg')).toBe('.jpg')
      expect(extFromMime('video/webm')).toBe('.webm')
    })

    it('returns empty for unknown mime', () => {
      expect(extFromMime('application/json')).toBe('')
    })
  })

  describe('mediaKindFromUrl', () => {
    it('detects kind from simple url', () => {
      expect(mediaKindFromUrl('https://example.com/video.mp4')).toBe('video')
      expect(mediaKindFromUrl('https://example.com/image.jpg')).toBe('image')
    })

    it('detects kind from signed supabase url', () => {
      const url = 'https://supabase.co/storage/v1/object/public/stories/user/123.mp4?token=abc'
      expect(mediaKindFromUrl(url)).toBe('video')
    })

    it('handles query parameters safely', () => {
      expect(mediaKindFromUrl('http://site.com/vid.mov?foo=bar.jpg')).toBe('video')
    })
  })
})
