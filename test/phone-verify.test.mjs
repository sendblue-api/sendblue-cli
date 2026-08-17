import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSmsDeepLink } from '../dist/lib/phone-verify.js'

test('buildSmsDeepLink emits the standards-compatible prefilled message URI', () => {
    assert.equal(
        buildSmsDeepLink('+15559999999', 'AB 2&3'),
        'sms:+15559999999?body=AB%202%263'
    )
})
