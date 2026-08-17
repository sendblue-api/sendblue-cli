import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import test from 'node:test'

test('JSONL integrations receive recovery warnings without losing the live stream', { timeout: 15_000 }, async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sendblue-cli-events-'))
    const configDir = path.join(home, '.sendblue')
    await fs.mkdir(configDir, { mode: 0o700 })
    await fs.writeFile(path.join(configDir, 'credentials.json'), JSON.stringify({
        apiKey: 'integration-key',
        apiSecret: 'integration-secret',
        email: 'owner@example.com',
        assignedNumber: '',
        plan: 'test',
        createdAt: new Date().toISOString()
    }), { mode: 0o600 })

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (url.pathname === '/api/v2/events') {
            res.writeHead(200, { 'content-type': 'text/event-stream' })
            res.write(': ready\n\n')
            return
        }
        if (url.pathname === '/api/v2/messages') {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ message: 'message recovery unavailable' }))
            return
        }
        if (url.pathname === '/api/v2/contacts') {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end('[]')
            return
        }
        if (url.pathname === '/api/v2/lines/state') {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ data: [], snapshot_at: '2026-08-17T00:00:00.000Z' }))
            return
        }
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('{}')
    })

    try {
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        assert.ok(address && typeof address === 'object')

        const child = spawn(process.execPath, ['dist/index.js', 'events', '--once', '--jsonl', '--include-control'], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                HOME: home,
                SENDBLUE_API_BASE: `http://127.0.0.1:${address.port}`
            },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
        child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })

        const [code, signal] = await once(child, 'exit')
        assert.equal(signal, null)
        assert.equal(code, 0)

        const records = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
        assert.deepEqual(records.map((record) => record.type), [
            'stream.connected',
            'lines.snapshot',
            'recovery.warning'
        ])
        const warning = records.find((record) => record.type === 'recovery.warning')
        assert.match(warning.data.error, /message recovery unavailable/)
        assert.match(stderr, /Recovery warning: message recovery unavailable/)

        const cursorName = (await fs.readdir(configDir)).find((name) => /^events-[a-f0-9]{16}\.json$/.test(name))
        assert.ok(cursorName)
        assert.equal((await fs.stat(path.join(configDir, cursorName))).mode & 0o777, 0o600)
    } finally {
        server.closeAllConnections?.()
        await new Promise((resolve) => server.close(resolve))
        await fs.rm(home, { recursive: true, force: true })
    }
})
