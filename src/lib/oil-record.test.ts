import { describe, expect, it } from 'vitest'
import { ORB_CODES, codeInfo, itemsLabel, linesFrom } from './oil-record'

describe('Oil Record Book codes', () => {
  it('has every Part I code, A to I, in order', () => {
    expect(ORB_CODES.map((c) => c.code).join('')).toBe('ABCDEFGHI')
  })
  it('bunkering requires a quantity in tonnes', () => {
    expect(codeInfo('H').quantity).toMatchObject({ unit: 't', required: true })
  })
})

describe('linesFrom', () => {
  it('keeps only the items written, in the code order', () => {
    expect(linesFrom('C', { '12.3': 'Incinerated 0.2 m3, 10:00-11:30', '11.1': 'Sludge tank 1.2 m3, retained 0.8 m3', '12.1': '  ' })).toEqual([
      { item: '11.1', text: 'Sludge tank 1.2 m3, retained 0.8 m3' },
      { item: '12.3', text: 'Incinerated 0.2 m3, 10:00-11:30' },
    ])
  })
  it('is null when nothing was written', () => {
    expect(linesFrom('D', { '13': ' ' })).toBeNull()
  })
  it('code I has a single free line', () => {
    expect(linesFrom('I', { '': 'Weekly test of the 15 ppm alarm: satisfactory' })).toEqual([
      { item: null, text: 'Weekly test of the 15 ppm alarm: satisfactory' },
    ])
  })
  it('labels the items as the book does', () => {
    expect(itemsLabel('C', [{ item: '11.1', text: 'x' }, { item: '12.3', text: 'y' }])).toBe('C 11.1, 12.3')
    expect(itemsLabel('I', [{ item: null, text: 'x' }])).toBe('I')
  })
})
