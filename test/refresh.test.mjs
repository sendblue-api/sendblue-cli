import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'sendblue-cli-refresh-'))
process.env.HOME = home
process.env.USERPROFILE = home

const configDir = join(home, '.sendblue')
const credentialsPath = join(configDir, 'credentials.json')
mkdirSync(configDir, { recursive: true })

const baseCredentials = {
    apiKey: 'key_123',
    apiSecret: 'secret_123',
    email: 'owner@example.com',
    companyName: 'test-company',
    assignedNumber: '+15550000000',
    plan: 'free_api',
    createdAt: '2026-05-06T00:00:00.000Z'
}

function writeCredentials(overrides = {}) {
    writeFileSync(credentialsPath, JSON.stringify({
        ...baseCredentials,
        ...overrides
    }, null, 2))
}

function readCredentials() {
    return JSON.parse(readFileSync(credentialsPath, 'utf8'))
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    })
}

test.after(() => {
    rmSync(home, { recursive: true, force: true })
})

test('status refreshes local credentials after provisioning completes', async () => {
    writeCredentials()
    const requests = []
    global.fetch = async (url) => {
        requests.push(url.toString())
        if (url.toString().includes('/api/v3/billing/provisioning-status')) {
            return jsonResponse({ status: 'complete', newNumber: '+15551112222' })
        }
        if (url.toString() === 'https://api.sendblue.com/account') {
            return jsonResponse({ status: 'ok', plan: 'inbound_only' })
        }
        throw new Error(`Unexpected request: ${url}`)
    }

    const { statusCommand } = await import('../dist/commands/status.js')
    await statusCommand()

    assert.deepEqual(readCredentials(), {
        ...baseCredentials,
        assignedNumber: '+15551112222',
        plan: 'inbound_only'
    })
    assert.ok(requests.some((url) => url.includes('/api/v3/billing/provisioning-status')))
})

test('send refreshes before using assignedNumber as from_number', async () => {
    writeCredentials()
    let sendBody = null
    global.fetch = async (url, init = {}) => {
        if (url.toString().includes('/api/v3/billing/provisioning-status')) {
            return jsonResponse({ status: 'complete', newNumber: '+15553334444' })
        }
        if (url.toString() === 'https://api.sendblue.com/api/send-message') {
            sendBody = JSON.parse(init.body)
            return jsonResponse({ status: 'ok', messageId: 'msg_123' })
        }
        throw new Error(`Unexpected request: ${url}`)
    }

    const { sendCommand } = await import('../dist/commands/send.js')
    await sendCommand('+15555550123', 'hello', {})

    assert.equal(sendBody.from_number, '+15553334444')
    assert.equal(readCredentials().assignedNumber, '+15553334444')
    assert.equal(readCredentials().plan, 'inbound_only')
})

test('send validates missing local media before checking provisioning', async () => {
    writeCredentials()
    let fetchCalls = 0
    global.fetch = async () => {
        fetchCalls += 1
        return jsonResponse({ status: 'complete', newNumber: '+15553334444' })
    }

    const exit = process.exit
    process.exit = ((code) => {
        throw new Error(`process.exit:${code}`)
    })

    try {
        const { sendCommand } = await import('../dist/commands/send.js')
        await assert.rejects(
            () => sendCommand('+15555550123', 'hello', { media: './missing.png' }),
            /process\.exit:1/
        )
        assert.equal(fetchCalls, 0)
    } finally {
        process.exit = exit
    }
})

test('send-group validates usage before checking provisioning', async () => {
    writeCredentials()
    let fetchCalls = 0
    global.fetch = async () => {
        fetchCalls += 1
        return jsonResponse({ status: 'complete', newNumber: '+15553334444' })
    }

    const exit = process.exit
    process.exit = ((code) => {
        throw new Error(`process.exit:${code}`)
    })

    try {
        const { sendGroupCommand } = await import('../dist/commands/send-group.js')
        await assert.rejects(
            () => sendGroupCommand(['+15555550123', 'hello'], {}),
            /process\.exit:1/
        )
        assert.equal(fetchCalls, 0)
    } finally {
        process.exit = exit
    }
})

test('refresh returns provisioned in-memory credentials when saving fails', async () => {
    writeCredentials()
    chmodSync(credentialsPath, 0o400)
    global.fetch = async (url) => {
        if (url.toString().includes('/api/v3/billing/provisioning-status')) {
            return jsonResponse({ status: 'complete', newNumber: '+15556667777' })
        }
        throw new Error(`Unexpected request: ${url}`)
    }

    try {
        const { refreshCredentialsFromProvisioning } = await import('../dist/lib/refresh.js')
        const result = await refreshCredentialsFromProvisioning(baseCredentials)

        assert.equal(result.refreshed, true)
        assert.equal(result.credentials.assignedNumber, '+15556667777')
        assert.equal(result.credentials.plan, 'inbound_only')
    } finally {
        chmodSync(credentialsPath, 0o600)
    }
})
