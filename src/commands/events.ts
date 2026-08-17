import chalk from 'chalk'
import { getCredentials } from '../lib/config.js'
import {
    EVENT_TYPES,
    acceptEvent,
    connectEventStream,
    consumeEventStream,
    loadEventCursor,
    recoverEvents,
    saveEventCursor,
    type SendblueControl,
    type SendblueEvent
} from '../lib/events.js'
import { printError } from '../lib/format.js'

interface EventsOptions {
    includeControl?: boolean
    jsonl?: boolean
    recover?: boolean
    once?: boolean
    since?: string
    types?: string
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve()
    return new Promise((resolve) => {
        const onAbort = () => {
            clearTimeout(timer)
            resolve()
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

function eventSummary(event: SendblueEvent): string {
    const data = event.data
    if (event.type.startsWith('message.')) return `${data.message_id || 'message'} ${data.status || ''}`.trim()
    if (event.type === 'typing.changed') return `${data.number || ''} ${data.is_typing ? 'typing' : 'stopped'}`.trim()
    if (event.type.startsWith('line.')) return `${data.sendblue_number || data.worker_id || 'line'} ${data.status || ''}`.trim()
    if (event.type === 'contact.created') return String(data.phone || data.contact_id || 'contact')
    if (event.type.startsWith('verification.')) return String(data.verification_sid || 'verification')
    return ''
}

export async function eventsCommand(opts: EventsOptions): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` or `sendblue login`.')
        process.exitCode = 1
        return
    }

    if (opts.since && Number.isNaN(new Date(opts.since).getTime())) {
        printError('--since must be a valid ISO 8601 date')
        process.exitCode = 1
        return
    }
    const types = opts.types?.split(',').map((item) => item.trim()).filter(Boolean) || []
    const invalidTypes = types.filter((type) => !(EVENT_TYPES as readonly string[]).includes(type))
    if (invalidTypes.length) {
        printError(`Unknown event type(s): ${invalidTypes.join(', ')}`)
        process.exitCode = 1
        return
    }

    const cursor = loadEventCursor(creds, opts.since)
    const abort = new AbortController()
    const stop = () => abort.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)

    let cursorSaveTimer: ReturnType<typeof setTimeout> | null = null
    // Persist even an event-free first run on clean shutdown so the next run
    // can recover activity that occurred while the CLI was offline.
    let cursorDirty = true
    let cursorSaveWarningShown = false
    const flushCursor = () => {
        if (cursorSaveTimer) clearTimeout(cursorSaveTimer)
        cursorSaveTimer = null
        if (!cursorDirty) return
        try {
            saveEventCursor(creds, cursor)
            cursorDirty = false
            cursorSaveWarningShown = false
        } catch (error) {
            if (!cursorSaveWarningShown) {
                cursorSaveWarningShown = true
                const message = error instanceof Error ? error.message : String(error)
                console.error(chalk.yellow(`Could not persist the event cursor: ${message}`))
            }
        }
    }
    const scheduleCursorSave = () => {
        cursorDirty = true
        if (cursorSaveTimer) return
        cursorSaveTimer = setTimeout(flushCursor, 250)
        cursorSaveTimer.unref?.()
    }

    const emit = (event: SendblueEvent) => {
        if (types.length && !types.includes(event.type)) return
        if (!acceptEvent(cursor, event)) return
        scheduleCursorSave()
        if (opts.jsonl) {
            process.stdout.write(`${JSON.stringify(event)}\n`)
            return
        }
        const time = new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const recovery = event.recovered ? chalk.dim(' recovered') : ''
        console.log(`${chalk.dim(time)} ${chalk.cyan(event.type)}${recovery} ${eventSummary(event)}`.trimEnd())
    }

    const emitControlRecord = (control: SendblueControl) => {
        if (!opts.includeControl) return
        if (opts.jsonl) process.stdout.write(`${JSON.stringify(control)}\n`)
        else console.error(chalk.dim(`${control.type}${control.data.error ? `: ${control.data.error}` : ''}`))
    }

    const emitControl = (type: 'stream.connected' | 'stream.disconnected', data: Record<string, unknown> = {}) => {
        emitControlRecord({
            version: 1,
            id: `${type}:${Date.now()}`,
            type,
            occurred_at: new Date().toISOString(),
            data
        })
    }

    let retryMs = 1_000
    try {
        while (!abort.signal.aborted) {
            try {
                // The server subscribes this connection before returning headers. Run
                // catch-up now while the response stream buffers new live events.
                const stream = await connectEventStream(creds, types, abort.signal)
                emitControl('stream.connected')
                if (opts.recover !== false) {
                    const warnings = await recoverEvents(creds, cursor, emit, emitControlRecord)
                    warnings.forEach((warning, index) => {
                        emitControlRecord({
                            version: 1,
                            id: `recovery.warning:${Date.now()}:${index}`,
                            type: 'recovery.warning',
                            occurred_at: new Date().toISOString(),
                            data: { error: warning }
                        })
                        console.error(chalk.yellow(`Recovery warning: ${warning}`))
                    })
                }
                if (opts.once) break

                retryMs = 1_000
                await consumeEventStream(stream, abort.signal, emit)
                if (!abort.signal.aborted) throw new Error('Event stream ended')
            } catch (error) {
                if (abort.signal.aborted) break
                const message = error instanceof Error ? error.message : String(error)
                emitControl('stream.disconnected', { error: message, retry_in_ms: retryMs })
                if (!opts.jsonl) console.error(chalk.yellow(`Event stream disconnected: ${message}; retrying...`))
                await waitForRetry(retryMs, abort.signal)
                retryMs = Math.min(retryMs * 2, 30_000)
            }
        }
    } finally {
        abort.abort()
        process.removeListener('SIGINT', stop)
        process.removeListener('SIGTERM', stop)
        flushCursor()
    }
}
