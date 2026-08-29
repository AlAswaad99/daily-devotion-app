import { describe, expect, it } from 'vitest'
import {
  computeExpectedSeconds, EXPECTED_SECONDS_FLOOR, meetsCompletionBar, requiredSeconds,
} from '../src/completion.js'

describe('requiredSeconds', () => {
  it('never drops below the 60s absolute floor', () => {
    expect(requiredSeconds(90)).toBe(60)
  })
  it('is half the expected time once that exceeds the floor', () => {
    expect(requiredSeconds(300)).toBe(150)
  })
})

describe('meetsCompletionBar', () => {
  const base = { scrollDepth: 1, foregroundSeconds: 200, expectedSeconds: 300 }
  it('passes when both scroll and time are satisfied', () => {
    expect(meetsCompletionBar(base)).toBe(true)
  })
  it('fails on shallow scroll', () => {
    expect(meetsCompletionBar({ ...base, scrollDepth: 0.9 })).toBe(false)
  })
  it('fails when time is short', () => {
    expect(meetsCompletionBar({ ...base, foregroundSeconds: 40 })).toBe(false)
  })
})

describe('computeExpectedSeconds', () => {
  it('applies the 90s floor to short text', () => {
    expect(computeExpectedSeconds('a few words only')).toBe(EXPECTED_SECONDS_FLOOR)
  })
  it('reads 200 words in 60 seconds', () => {
    expect(computeExpectedSeconds(Array(600).fill('word').join(' '))).toBe(180)
  })
})
