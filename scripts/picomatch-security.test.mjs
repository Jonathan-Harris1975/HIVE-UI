import assert from 'node:assert/strict'
import { test } from 'node:test'
import picomatch from 'picomatch'

const vulnerablePatterns = new Map([
  ['+(*)', '^(?:\\+\\(\\*\\))$'],
  ['+(*a)', '^(?:\\+\\(\\*a\\))$'],
  ['+(a*)', '^(?:\\+\\(a\\*\\))$'],
  ['*(a*|b)', '^(?:\\*\\(a\\*\\|b\\))$'],
  ['+(ab|abab)', '^(?:\\+\\(ab\\|abab\\))$'],
])

test('vendored picomatch literalises CVE-2026-112366 patterns', () => {
  for (const [pattern, expectedSource] of vulnerablePatterns) {
    const source = picomatch.makeRe(pattern).source
    assert.equal(source, expectedSource, `${pattern} was not literalised`)
  }
})

test('vendored picomatch rejects crafted ReDoS inputs promptly', () => {
  const startedAt = performance.now()

  assert.equal(picomatch.isMatch(`${'a'.repeat(100)}!`, '+(*a)'), false)
  assert.equal(picomatch.isMatch(`${'ab'.repeat(100)}c`, '+(ab|abab)'), false)

  assert.ok(performance.now() - startedAt < 2000, 'crafted patterns exceeded 2000 ms')
})

test('ordinary extglobs retain their expected behaviour', () => {
  assert.equal(picomatch.isMatch('jsjsx', '+(js|jsx)'), true)
  assert.equal(picomatch.isMatch('foobar', '*(foo|bar)'), true)
})

test('unescaping handles repeated unmatched brackets promptly', () => {
  const input = `${'\\['.repeat(20_000)}/file*.js`
  const startedAt = performance.now()
  const result = picomatch.scan(input, { unescape: true })

  assert.equal(result.base, '['.repeat(20_000))
  assert.equal(result.glob, 'file*.js')
  assert.equal(picomatch.scan('foo\\[bar\\]/*.js', { unescape: true }).base, 'foo[bar]')
  assert.ok(performance.now() - startedAt < 100, 'unescaping exceeded 100 ms')
})
