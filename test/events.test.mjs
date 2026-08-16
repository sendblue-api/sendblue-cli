import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptEvent, consumeEventStream, recoverEvents } from '../dist/lib/events.js'

function cursor() {
    return {
        version: 1,
        recent_ids: [],
        messages_updated_at: '2026-08-16T00:00:00.000Z',
        contacts_created_at: '2026-08-16T00:00:00.000Z',
        verifications_updated_at: '2026-08-16T00:00:00.000Z'
    }
}

test('deduplicates by event ID and advances only the matching domain watermark', () => {
    const state = cursor()
    const event = {
        version: 1,
        id: 'message:m1:updated:2026-08-16T01:00:00.000Z',
        type: 'message.updated',
        occurred_at: '2026-08-16T01:00:00.000Z',
        data: { message_id: 'm1' }
    }

    assert.equal(acceptEvent(state, event), true)
    assert.equal(acceptEvent(state, event), false)
    assert.equal(state.messages_updated_at, event.occurred_at)
    assert.equal(state.contacts_created_at, '2026-08-16T00:00:00.000Z')
})

test('parses version-one events while ignoring control and malformed frames', async () => {
    const encoder = new TextEncoder()
    const chunks = [
        'event: ready\ndata: {"status":"OK"}\n\n',
        'event: message.received\ndata: {"version":2,"id":"old","type":"message.received","occurred_at":"2026-08-16T00:00:00Z","data":{}}\n\n',
        'event: future.event\ndata: {"version":1,"id":"future","type":"future.event","occurred_at":"2026-08-16T00:00:00Z","data":{}}\n\n',
        'event: message.received\ndata: {"version":1,"id":"m1","type":"message.received","occurred_at":"2026-08-16T00:00:00Z","data":{"message_id":"m1"}}\n\n'
    ]
    const body = new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        }
    })
    const seen = []

    await consumeEventStream(new Response(body), new AbortController().signal, (event) => seen.push(event))

    assert.deepEqual(seen.map((event) => event.id), ['m1'])
})

test('recovery queries overlap durable cursors by one minute', async () => {
    const requested = []
    const originalFetch = global.fetch
    global.fetch = async (url) => {
        requested.push(String(url))
        if (String(url).includes('/api/v2/messages')) return Response.json({ data: [] })
        if (String(url).includes('/api/v2/contacts')) return Response.json([])
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
    }

    try {
        await recoverEvents(
            { apiKey: 'key', apiSecret: 'secret', email: 'owner@example.com' },
            cursor(),
            () => {}
        )
    } finally {
        global.fetch = originalFetch
    }

    const messageUrl = new URL(requested.find((url) => url.includes('/api/v2/messages')))
    const contactUrl = new URL(requested.find((url) => url.includes('/api/v2/contacts')))
    assert.equal(messageUrl.searchParams.get('updated_at_gte'), '2026-08-15T23:59:00.000Z')
    assert.equal(contactUrl.searchParams.get('created_at_gte'), '2026-08-15T23:59:00.000Z')
})

test('recovery reconstructs missed inbound creation as well as current message state', async () => {
    const originalFetch = global.fetch
    global.fetch = async (url) => {
        if (String(url).includes('/api/v2/messages')) {
            return Response.json({
                data: [{
                    message_handle: 'm-recovered',
                    is_outbound: false,
                    status: 'RECEIVED',
                    date_sent: '2026-08-15T23:59:30.000Z',
                    date_updated: '2026-08-16T00:00:10.000Z',
                    number: '+15550000001',
                    sendblue_number: '+15550000002'
                }]
            })
        }
        if (String(url).includes('/api/v2/contacts')) return Response.json([])
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
    }
    const seen = []

    try {
        await recoverEvents(
            { apiKey: 'key', apiSecret: 'secret', email: 'owner@example.com' },
            cursor(),
            (event) => seen.push(event)
        )
    } finally {
        global.fetch = originalFetch
    }

    assert.deepEqual(seen.map((event) => [event.type, event.id]), [
        ['message.received', 'message:m-recovered:received'],
        ['message.updated', 'message:m-recovered:updated:2026-08-16T00:00:10.000Z']
    ])
})

test('contact recovery uses the immutable contact identity from the API', async () => {
    const originalFetch = global.fetch
    global.fetch = async (url) => {
        if (String(url).includes('/api/v2/messages')) return Response.json({ data: [] })
        if (String(url).includes('/api/v2/contacts')) {
            return Response.json([{
                contact_id: 'contact-stable-id',
                phone: '+15550000001',
                created_at: '2026-08-16T00:00:10.000Z'
            }])
        }
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
    }
    const seen = []

    try {
        await recoverEvents(
            { apiKey: 'key', apiSecret: 'secret', email: 'owner@example.com' },
            cursor(),
            (event) => seen.push(event)
        )
    } finally {
        global.fetch = originalFetch
    }

    assert.deepEqual(seen.map((event) => event.id), [
        'contact:contact-stable-id:created:2026-08-16T00:00:10.000Z'
    ])
})

test('line recovery emits an authoritative control snapshot even when it is empty', async () => {
    const originalFetch = global.fetch
    global.fetch = async (url) => {
        if (String(url).includes('/api/v2/messages')) return Response.json({ data: [] })
        if (String(url).includes('/api/v2/contacts')) return Response.json([])
        if (String(url).includes('/api/v2/lines/state')) {
            return Response.json({ status: 'OK', data: [], snapshot_at: '2026-08-16T00:00:20.000Z' })
        }
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
    }
    const controls = []

    try {
        await recoverEvents(
            { apiKey: 'key', apiSecret: 'secret', email: 'owner@example.com' },
            cursor(),
            () => {},
            (control) => controls.push(control)
        )
    } finally {
        global.fetch = originalFetch
    }

    assert.deepEqual(controls, [{
        version: 1,
        id: 'lines.snapshot:2026-08-16T00:00:20.000Z',
        type: 'lines.snapshot',
        occurred_at: '2026-08-16T00:00:20.000Z',
        data: { lines: [], snapshot_at: '2026-08-16T00:00:20.000Z' }
    }])
})
