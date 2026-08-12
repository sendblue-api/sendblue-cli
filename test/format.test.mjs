import assert from 'node:assert/strict'
import test from 'node:test'

import { isE164PhoneNumber } from '../dist/lib/format.js'

test('isE164PhoneNumber matches the server 8-to-15 digit contract', () => {
    assert.equal(isE164PhoneNumber('+12345678'), true)
    assert.equal(isE164PhoneNumber('+123456789012345'), true)
    assert.equal(isE164PhoneNumber('+1234567'), false)
    assert.equal(isE164PhoneNumber('+01234567'), false)
    assert.equal(isE164PhoneNumber('+1234567890123456'), false)
})
