import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

test('config override isolates files and enforces private permissions', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sendblue-cli-config-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    process.env.SENDBLUE_CONFIG_DIR = path.join(root, 'nested', 'config')
    const moduleUrl = `${pathToFileURL(path.resolve('dist/lib/config.js')).href}?test=${Date.now()}`
    const config = await import(moduleUrl)

    config.saveCredentials({
        apiKey: 'key',
        apiSecret: 'secret',
        email: 'phone@example.com',
        assignedNumber: '+15550000001',
        plan: 'free_api',
        createdAt: new Date().toISOString()
    })
    config.savePendingVerification({
        flow: 'setup',
        sessionId: 'session',
        phoneNumber: '+15551234567',
        sharedNumber: '+15559999999',
        challenge: 'AB2CD3',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
    })

    assert.equal(config.credentialsPath(), path.join(process.env.SENDBLUE_CONFIG_DIR, 'credentials.json'))
    assert.equal(fs.statSync(process.env.SENDBLUE_CONFIG_DIR).mode & 0o777, 0o700)
    assert.equal(fs.statSync(config.credentialsPath()).mode & 0o777, 0o600)
    assert.equal(fs.statSync(path.join(process.env.SENDBLUE_CONFIG_DIR, 'pending-verification.json')).mode & 0o777, 0o600)

    fs.chmodSync(config.credentialsPath(), 0o644)
    config.saveCredentials(config.getCredentials())
    assert.equal(fs.statSync(config.credentialsPath()).mode & 0o777, 0o600)
})
