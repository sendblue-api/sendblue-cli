import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import test from 'node:test'

test('sandbox init requires --phone in a non-interactive shell', (t) => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sendblue-cli-sandbox-'))
    t.after(() => fs.rmSync(configDir, { recursive: true, force: true }))

    const result = spawnSync(process.execPath, ['dist/index.js', 'sandbox', 'init', '--no-wait'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
            ...process.env,
            FORCE_COLOR: '0',
            SENDBLUE_CONFIG_DIR: configDir
        }
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /requires --phone <number> in a non-interactive shell/i)
})

test('sandbox init sends --phone and persists a resumable Verify challenge', async (t) => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sendblue-cli-sandbox-'))
    t.after(() => fs.rmSync(configDir, { recursive: true, force: true }))
    let requestBody
    const server = http.createServer((request, response) => {
        let body = ''
        request.setEncoding('utf8')
        request.on('data', (chunk) => { body += chunk })
        request.on('end', () => {
            requestBody = JSON.parse(body)
            response.writeHead(200, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({
                status: 'PENDING',
                sessionId: 'session-1',
                phoneNumber: '+15551234567',
                sharedNumber: '+15559999999',
                challenge: 'AB2CD3',
                expiresAt: new Date(Date.now() + 300_000).toISOString()
            }))
        })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => server.close())
    const address = server.address()

    const result = await new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ['dist/index.js', 'sandbox', 'init', '--phone', '+1 (555) 123-4567', '--no-wait'],
            {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    FORCE_COLOR: '0',
                    SENDBLUE_CONFIG_DIR: configDir,
                    SENDBLUE_SETUP_BASE: `http://127.0.0.1:${address.port}`
                }
            }
        )
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
        child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
        child.on('error', reject)
        child.on('close', (status) => resolve({ status, stdout, stderr }))
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(requestBody, {
        action: 'phone-setup-start',
        phoneNumber: '+15551234567'
    })
    assert.match(result.stdout, /sms:\+15559999999\?body=AB2CD3/)
    const pendingPath = path.join(configDir, 'pending-verification.json')
    assert.deepEqual(JSON.parse(fs.readFileSync(pendingPath, 'utf8')), {
        flow: 'setup',
        sessionId: 'session-1',
        phoneNumber: '+15551234567',
        sharedNumber: '+15559999999',
        challenge: 'AB2CD3',
        expiresAt: JSON.parse(fs.readFileSync(pendingPath, 'utf8')).expiresAt
    })
    assert.equal(fs.statSync(pendingPath).mode & 0o777, 0o600)
})
