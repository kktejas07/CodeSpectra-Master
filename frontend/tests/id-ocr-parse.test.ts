import { describe, expect, it } from 'vitest'
import { parseIdOcrPayload } from '../lib/assessment/id-ocr-parse'

describe('parseIdOcrPayload', () => {
  it('drops a guessed name when the model did not confirm an ID card', () => {
    expect(parseIdOcrPayload('{ "name": "Sushant Kumar" }')).toEqual({ isIdCard: false, name: '' })
  })

  it('drops a name when is_id_card is false (selfie)', () => {
    expect(parseIdOcrPayload('{ "is_id_card": false, "name": "Sushant Kumar" }')).toEqual({
      isIdCard: false,
      name: '',
    })
  })

  it('keeps a name only when an ID card is confirmed', () => {
    expect(parseIdOcrPayload('{ "is_id_card": true, "name": "Jane Doe" }')).toEqual({
      isIdCard: true,
      name: 'Jane Doe',
    })
  })

  it('treats unreadable-but-present ID as empty name', () => {
    expect(parseIdOcrPayload('{ "is_id_card": true, "name": "" }')).toEqual({
      isIdCard: true,
      name: '',
    })
  })
})
