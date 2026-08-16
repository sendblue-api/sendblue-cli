import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { API_BASE } from './api.js'
import { sendblueConfigDir, type SendblueCredentials } from './config.js'

export const EVENT_TYPES = [
    'message.received',
    'message.created',
    'message.updated',
    'typing.changed',
    'line.assigned',
    'line.unassigned',
    'line.status.changed',
    'line.blocked',
    'contact.created',
    'verification.approved',
    'verification.expired',
    'verification.canceled'
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface SendblueEvent {
    version: 1
    id: string
    type: string
    occurred_at: string
    data: Record<string, unknown>
    recovered?: boolean
}

export interface SendblueControl {
    version: 1
    id: string
    type: string
    occurred_at: string
    data: Record<string, unknown>
}

interface EventCursor {
    version: 1
    recent_ids: string[]
    messages_updated_at: string
    contacts_created_at: string
    verifications_updated_at: string
}

const MAX_RECENT_IDS = 2_000
const RECOVERY_OVERLAP_MS = 60_000

function authHeaders(creds: SendblueCredentials): Record<string, string> {
    return {
        'sb-api-key-id': creds.apiKey,
        'sb-api-secret-key': creds.apiSecret
    }
}

function accountCursorPath(creds: SendblueCredentials): string {
    const accountHash = createHash('sha256').update(creds.email.toLowerCase()).digest('hex').slice(0, 16)
    return path.join(sendblueConfigDir(), `events-${accountHash}.json`)
}

function validDate(value: unknown): value is string {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

export function loadEventCursor(creds: SendblueCredentials, since?: string): EventCursor {
    const fallback = since || new Date().toISOString()
    if (since) {
        return {
            version: 1,
            recent_ids: [],
            messages_updated_at: since,
            contacts_created_at: since,
            verifications_updated_at: since
        }
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(accountCursorPath(creds), 'utf8')) as Partial<EventCursor>
        if (
            parsed.version === 1 &&
            Array.isArray(parsed.recent_ids) &&
            validDate(parsed.messages_updated_at) &&
            validDate(parsed.contacts_created_at) &&
            validDate(parsed.verifications_updated_at)
        ) return parsed as EventCursor
    } catch {
        // First run or invalid cursor: begin at now, then rely on live events.
    }

    return {
        version: 1,
        recent_ids: [],
        messages_updated_at: fallback,
        contacts_created_at: fallback,
        verifications_updated_at: fallback
    }
}

export function saveEventCursor(creds: SendblueCredentials, cursor: EventCursor): void {
    const target = accountCursorPath(creds)
    const temporary = `${target}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(cursor, null, 2), { mode: 0o600 })
    fs.renameSync(temporary, target)
}

export function acceptEvent(cursor: EventCursor, event: SendblueEvent): boolean {
    if (cursor.recent_ids.includes(event.id)) return false
    cursor.recent_ids.push(event.id)
    if (cursor.recent_ids.length > MAX_RECENT_IDS) {
        cursor.recent_ids.splice(0, cursor.recent_ids.length - MAX_RECENT_IDS)
    }

    if (event.type.startsWith('message.')) cursor.messages_updated_at = maxDate(cursor.messages_updated_at, event.occurred_at)
    if (event.type === 'contact.created') cursor.contacts_created_at = maxDate(cursor.contacts_created_at, event.occurred_at)
    if (event.type.startsWith('verification.')) {
        cursor.verifications_updated_at = maxDate(cursor.verifications_updated_at, event.occurred_at)
    }
    return true
}

function maxDate(left: string, right: string): string {
    return new Date(right).getTime() > new Date(left).getTime() ? right : left
}

function recoveryStart(cursor: string): string {
    return new Date(Math.max(0, new Date(cursor).getTime() - RECOVERY_OVERLAP_MS)).toISOString()
}

async function apiGet(creds: SendblueCredentials, pathname: string): Promise<Response> {
    return fetch(`${API_BASE}${pathname}`, { headers: authHeaders(creds) })
}

async function requireJson(res: Response, label: string): Promise<any> {
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message || body.error || `${label} failed (${res.status})`)
    return body
}

export async function connectEventStream(
    creds: SendblueCredentials,
    types: string[],
    signal: AbortSignal
): Promise<Response> {
    const query = types.length ? `?types=${encodeURIComponent(types.join(','))}` : ''
    const res = await fetch(`${API_BASE}/api/v2/events${query}`, {
        headers: { ...authHeaders(creds), accept: 'text/event-stream' },
        signal
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        if (res.status === 404) throw new Error('This Sendblue server does not have the events endpoint yet')
        throw new Error((body.message as string) || `Event stream failed (${res.status})`)
    }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('text/event-stream')) {
        await res.body?.cancel().catch(() => undefined)
        throw new Error(`Event stream returned an unexpected content type (${contentType || 'missing'})`)
    }
    if (!res.body) throw new Error('Event stream returned no response body')
    return res
}

export async function consumeEventStream(
    res: Response,
    signal: AbortSignal,
    onEvent: (event: SendblueEvent) => void
): Promise<void> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (!signal.aborted) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            let separator: RegExpExecArray | null
            while ((separator = /\r?\n\r?\n/.exec(buffer)) !== null) {
                const block = buffer.slice(0, separator.index)
                buffer = buffer.slice(separator.index + separator[0].length)
                const parsed = parseSseBlock(block)
                if (parsed) onEvent(parsed)
            }
        }
    } finally {
        reader.releaseLock()
    }
}

function parseSseBlock(block: string): SendblueEvent | null {
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (!data.length) return null
    try {
        const parsed = JSON.parse(data.join('\n')) as Partial<SendblueEvent>
        if (
            parsed.version !== 1 ||
            typeof parsed.id !== 'string' ||
            parsed.id.length === 0 ||
            typeof parsed.type !== 'string' ||
            !(EVENT_TYPES as readonly string[]).includes(parsed.type) ||
            !validDate(parsed.occurred_at) ||
            !parsed.data ||
            typeof parsed.data !== 'object' ||
            Array.isArray(parsed.data)
        ) return null
        return parsed as SendblueEvent
    } catch {
        return null
    }
}

export async function recoverEvents(
    creds: SendblueCredentials,
    cursor: EventCursor,
    onEvent: (event: SendblueEvent) => void,
    onControl: (control: SendblueControl) => void = () => undefined
): Promise<string[]> {
    const warnings: string[] = []
    const recoverers = [
        recoverMessages(creds, recoveryStart(cursor.messages_updated_at), onEvent),
        recoverContacts(creds, recoveryStart(cursor.contacts_created_at), onEvent),
        recoverLines(creds, onEvent, onControl),
        recoverVerifications(creds, recoveryStart(cursor.verifications_updated_at), onEvent)
    ]
    const results = await Promise.allSettled(recoverers)
    for (const result of results) {
        if (result.status === 'rejected') warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }
    return warnings
}

async function recoverMessages(creds: SendblueCredentials, since: string, onEvent: (event: SendblueEvent) => void) {
    let offset = 0
    for (;;) {
        const params = new URLSearchParams({
            updated_at_gte: since,
            order_by: 'updated_at',
            order_direction: 'asc',
            limit: '100',
            offset: String(offset)
        })
        const body = await requireJson(await apiGet(creds, `/api/v2/messages?${params}`), 'Message recovery')
        const rows = Array.isArray(body.data) ? body.data : []
        for (const row of rows) {
            const messageId = row.message_handle || row.uuid || row.id
            const occurredAt = row.date_updated || row.updated_at || row.date_created
            if (!messageId || !validDate(occurredAt)) continue

            const createdAt = row.date_sent || row.date_created || row.created_at
            if (
                typeof row.is_outbound === 'boolean' &&
                validDate(createdAt) &&
                new Date(createdAt).getTime() >= new Date(since).getTime()
            ) {
                const creationType = row.is_outbound ? 'message.created' : 'message.received'
                onEvent({
                    version: 1,
                    id: `message:${messageId}:${row.is_outbound ? 'created' : 'received'}`,
                    type: creationType,
                    occurred_at: createdAt,
                    data: {
                        message_id: messageId,
                        is_outbound: row.is_outbound,
                        status: row.status,
                        updated_at: occurredAt,
                        number: row.number,
                        sendblue_number: row.sendblue_number
                    },
                    recovered: true
                })
            }

            onEvent({
                version: 1,
                id: `message:${messageId}:updated:${occurredAt}`,
                type: 'message.updated',
                occurred_at: occurredAt,
                data: {
                    message_id: messageId,
                    status: row.status,
                    updated_at: occurredAt,
                    number: row.number,
                    sendblue_number: row.sendblue_number,
                    is_outbound: row.is_outbound,
                    error_code: row.error_code,
                    error_message: row.error_message,
                    message: row
                },
                recovered: true
            })
        }
        if (rows.length < 100) return
        offset += rows.length
        if (offset >= 10_000) return
    }
}

async function recoverContacts(creds: SendblueCredentials, since: string, onEvent: (event: SendblueEvent) => void) {
    let offset = 0
    for (;;) {
        const params = new URLSearchParams({
            created_at_gte: since,
            order_by: 'created_at',
            order_direction: 'asc',
            limit: '1000',
            offset: String(offset)
        })
        const rows = await requireJson(await apiGet(creds, `/api/v2/contacts?${params}`), 'Contact recovery')
        if (!Array.isArray(rows)) return
        for (const row of rows) {
            const contactId = row.id || row.contact_id || row.phone
            const occurredAt = row.created_at
            if (!contactId || !validDate(occurredAt)) continue
            onEvent({
                version: 1,
                id: `contact:${contactId}:created:${occurredAt}`,
                type: 'contact.created',
                occurred_at: occurredAt,
                data: {
                    contact_id: contactId,
                    phone: row.phone || row.contact_primary_phone,
                    first_name: row.first_name || row.contact_first_name,
                    last_name: row.last_name || row.contact_last_name,
                    contact: row,
                    created_at: occurredAt
                },
                recovered: true
            })
        }
        if (rows.length < 1000) return
        offset += rows.length
        if (offset >= 10_000) return
    }
}

async function recoverLines(
    creds: SendblueCredentials,
    onEvent: (event: SendblueEvent) => void,
    onControl: (control: SendblueControl) => void
) {
    const res = await apiGet(creds, '/api/v2/lines/state')
    if ([403, 404].includes(res.status)) return
    const body = await requireJson(res, 'Line-state recovery')
    const lines = Array.isArray(body.data) ? body.data : []
    const snapshotAt = validDate(body.snapshot_at) ? body.snapshot_at : new Date().toISOString()
    onControl({
        version: 1,
        id: `lines.snapshot:${snapshotAt}`,
        type: 'lines.snapshot',
        occurred_at: snapshotAt,
        data: { lines, snapshot_at: snapshotAt }
    })

    for (const line of lines) {
        const occurredAt = validDate(line.status_changed_at) ? line.status_changed_at : snapshotAt
        onEvent({
            version: 1,
            id: `line:${line.worker_id}:status:${line.status}:${line.status_changed_at || 'unknown'}`,
            type: 'line.status.changed',
            occurred_at: occurredAt,
            data: { ...line, snapshot: true },
            recovered: true
        })
    }
}

async function recoverVerifications(creds: SendblueCredentials, since: string, onEvent: (event: SendblueEvent) => void) {
    let offset = 0
    for (;;) {
        const params = new URLSearchParams({ updated_at_gte: since, limit: '100', offset: String(offset) })
        const res = await apiGet(creds, `/api/v2/verify/verifications?${params}`)
        if ([403, 404, 503].includes(res.status)) return
        const body = await requireJson(res, 'Verification recovery')
        const rows = Array.isArray(body.data) ? body.data : []
        for (const row of rows) {
            if (!row.sid || !validDate(row.date_updated)) continue
            const type = `verification.${row.status}`
            if (!EVENT_TYPES.includes(type as EventType)) continue
            onEvent({
                version: 1,
                id: `verification:${row.sid}:${row.status}`,
                type,
                occurred_at: row.date_updated,
                data: { verification_sid: row.sid, status: row.status, verification: row },
                recovered: true
            })
        }
        if (rows.length < 100) return
        offset += rows.length
    }
}
