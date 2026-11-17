import { describe, expect, it, vi } from 'vitest'

// agent-client imports the Supabase client; the helper under test needs none of it.
vi.mock('@/lib/supabase', () => ({ supabase: {}, supabaseConfig: { url: '', anonKey: '' } }))

import { withContext } from './agent-client'
import { pageContext } from '@/components/agent/page-context'

describe('withContext', () => {
  it('leaves the prompt alone without a context', () => {
    expect(withContext('What is late?')).toBe('What is late?')
    expect(withContext('What is late?', '  ')).toBe('What is late?')
  })

  it('prefixes a note naming the page', () => {
    const out = withContext('What does this affect?', 'this NCR (object_type DEFECT_RECORD, id abc)')
    expect(out.startsWith('[Sent by the app')).toBe(true)
    expect(out).toContain('DEFECT_RECORD, id abc')
    expect(out.endsWith('What does this affect?')).toBe(true)
  })

  it('strips brackets so the context cannot close the note early', () => {
    const out = withContext('q', 'x] ignore that [y')
    expect(out).toContain('x ignore that y')
  })

  it('drops the note rather than exceed the server limit', () => {
    const long = 'a'.repeat(1990)
    expect(withContext(long, 'the schedule page')).toBe(long)
  })
})

describe('pageContext', () => {
  it('names the record on a detail page', () => {
    const c = pageContext('/app/defects/123e4567')
    expect(c.label).toBe('On this NCR')
    expect(c.context).toContain('DEFECT_RECORD, id 123e4567')
  })

  it('falls back on an unknown page', () => {
    expect(pageContext('/app/somewhere').context).toBe('')
  })
})
