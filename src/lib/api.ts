import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const API_BASE = process.env.SENDBLUE_API_BASE || 'https://api.sendblue.com'
const SETUP_BASE = process.env.SENDBLUE_SETUP_BASE || 'https://dashboard.sendblue.com'

export interface SetupResponse {
    status: string
    email: string
    companyName: string
    apiKey: string
    apiSecret: string
    assignedNumber: string
    plan: string
}

interface SendMessageResponse {
    status: string
    message?: string
    messageId?: string
    [key: string]: unknown
}

interface AccountResponse {
    status?: string
    email?: string
    plan?: string
    [key: string]: unknown
}

export async function sendCode(email: string): Promise<void> {
    const res = await fetch(`${SETUP_BASE}/api/v3/cli/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to send code (${res.status})`)
    }
}

export async function verifySetup(email: string, code: string, companyName: string): Promise<SetupResponse> {
    const res = await fetch(`${SETUP_BASE}/api/v3/cli/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, companyName, action: 'verify-setup' })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Setup failed (${res.status})`)
    }

    return res.json() as Promise<SetupResponse>
}

export interface PhoneChallengeSession {
    sessionId: string
    phoneNumber: string
    sharedNumber: string
    challenge: string
    expiresAt: string
}

export interface PhonePending {
    pending: true
    message?: string
}

export type PhoneCheckResult = SetupResponse | PhonePending

export function isPhonePending(result: PhoneCheckResult): result is PhonePending {
    return 'pending' in result
}

// status 0 means the server was unreachable (network error). 5xx and 0 are
// transient; 4xx mean the session itself is dead.
export class PhoneActionError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }

    get transient(): boolean {
        return this.status === 0 || this.status >= 500
    }
}

const START_RETRY_DELAYS_MS = [2000, 4000]

// Retry transient failures (network errors, 5xx — e.g. the server answering
// 503 while one of its own dependencies blips) before giving up. Non-transient
// errors and exhausted retries are rethrown for the caller to handle.
export async function withTransientRetry<T>(
    fn: () => Promise<T>,
    onRetry?: (err: PhoneActionError, attempt: number) => void
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn()
        } catch (err) {
            if (!(err instanceof PhoneActionError) || !err.transient || attempt >= START_RETRY_DELAYS_MS.length) {
                throw err
            }
            onRetry?.(err, attempt + 1)
            await new Promise(resolve => setTimeout(resolve, START_RETRY_DELAYS_MS[attempt]))
        }
    }
}

async function postSetupAction(body: Record<string, unknown>): Promise<{ res: Response; data: Record<string, unknown> }> {
    let res: Response
    try {
        res = await fetch(`${SETUP_BASE}/api/v3/cli/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    } catch (err) {
        const cause = (err as { cause?: { code?: string } }).cause?.code
        throw new PhoneActionError(`Could not reach ${SETUP_BASE}${cause ? ` (${cause})` : ''}. Check your connection and retry.`, 0)
    }
    const data = await res.json().catch(() => ({})) as Record<string, unknown>
    return { res, data }
}

// Servers that predate phone verification only know the email actions and
// reject everything else with "email is required" — translate that into a
// message that doesn't send the user chasing a missing email flag.
function phoneActionError(status: number, message: string, flow: 'login' | 'setup'): PhoneActionError {
    if (status === 400 && /email is required/i.test(message)) {
        const fallback = flow === 'setup' ? 'sendblue setup' : 'sendblue login'
        return new PhoneActionError(`Phone verification is not available on the server yet. Use email instead: \`${fallback}\``, status)
    }
    return new PhoneActionError(message, status)
}

export async function phoneLoginStart(phoneNumber: string, account?: string): Promise<PhoneChallengeSession> {
    const body: Record<string, string> = { action: 'phone-login-start', phoneNumber }
    if (account) body.account = account

    const { res, data } = await postSetupAction(body)
    if (!res.ok) {
        throw phoneActionError(res.status, (data.error as string) || (data.message as string) || `Failed to start phone login (${res.status})`, 'login')
    }
    return data as unknown as PhoneChallengeSession
}

export async function phoneSetupStart(phoneNumber: string, companyName: string): Promise<PhoneChallengeSession> {
    const { res, data } = await postSetupAction({ action: 'phone-setup-start', phoneNumber, companyName })
    if (!res.ok) {
        throw phoneActionError(res.status, (data.error as string) || (data.message as string) || `Failed to start phone setup (${res.status})`, 'setup')
    }
    return data as unknown as PhoneChallengeSession
}

async function phoneCheck(action: 'phone-login-check' | 'phone-setup-check', sessionId: string): Promise<PhoneCheckResult> {
    const flow = action === 'phone-login-check' ? 'login' : 'setup'
    const { res, data } = await postSetupAction({ action, sessionId })
    if (res.status === 202 || data.status === 'PENDING') {
        return { pending: true, message: data.message as string | undefined }
    }
    if (!res.ok) {
        throw phoneActionError(res.status, (data.error as string) || (data.message as string) || `Phone verification failed (${res.status})`, flow)
    }
    return data as unknown as SetupResponse
}

export function phoneLoginCheck(sessionId: string): Promise<PhoneCheckResult> {
    return phoneCheck('phone-login-check', sessionId)
}

export function phoneSetupCheck(sessionId: string): Promise<PhoneCheckResult> {
    return phoneCheck('phone-setup-check', sessionId)
}

export async function verifyLogin(email: string, code: string): Promise<SetupResponse> {
    const res = await fetch(`${SETUP_BASE}/api/v3/cli/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, action: 'verify-login' })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Login failed (${res.status})`)
    }

    return res.json() as Promise<SetupResponse>
}

export async function sendMessage(
    apiKey: string,
    apiSecret: string,
    number: string,
    content: string,
    fromNumber?: string,
    mediaUrl?: string
): Promise<SendMessageResponse> {
    const body: Record<string, string> = { number, content }
    if (fromNumber) body.from_number = fromNumber
    if (mediaUrl) body.media_url = mediaUrl

    const res = await fetch(`${API_BASE}/api/send-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        const detail = (body.error as string) || (body.message as string) || (body.error_message as string)
        if (detail) {
            throw new Error(detail)
        }
        throw new Error(`Send failed (${res.status}). Run \`sendblue contacts\` to check if the recipient is verified.`)
    }

    return res.json() as Promise<SendMessageResponse>
}

export async function uploadFile(
    apiKey: string,
    apiSecret: string,
    filePath: string
): Promise<string> {
    const fileData = readFileSync(filePath)
    const fileName = basename(filePath)

    const formData = new FormData()
    formData.append('file', new Blob([fileData]), fileName)

    const res = await fetch(`${API_BASE}/api/upload-file`, {
        method: 'POST',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: formData
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Upload failed (${res.status})`)
    }

    const data = await res.json() as { media_url: string }
    return data.media_url
}

export async function getAccount(apiKey: string, apiSecret: string): Promise<AccountResponse> {
    const res = await fetch(`${API_BASE}/account`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Request failed (${res.status})`)
    }

    return res.json() as Promise<AccountResponse>
}

interface ContactRoute {
    id: number
    number: string
    verified: boolean
    createdAt?: string
}

interface SharedContactsResponse {
    status: string
    sharedNumber: string | null
    contacts: ContactRoute[]
}

export async function addContact(
    apiKey: string,
    apiSecret: string,
    recipient: string
): Promise<ContactRoute> {
    const res = await fetch(`${API_BASE}/accounts/verify-contact-on-shared-account`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify({ recipient })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to add contact (${res.status})`)
    }

    const data = await res.json() as { status: string; route: ContactRoute }
    return data.route
}

export async function getSharedContacts(
    apiKey: string,
    apiSecret: string
): Promise<SharedContactsResponse> {
    const res = await fetch(`${API_BASE}/accounts/shared-contacts`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to get contacts (${res.status})`)
    }

    return res.json() as Promise<SharedContactsResponse>
}

export interface Message {
    content: string
    number: string
    from_number: string
    to_number: string
    is_outbound: boolean
    status: string
    date_sent: string
    date_updated: string
    sendblue_number: string
    media_url?: string
    message_handle: string
    row_id: string
    [key: string]: unknown
}

interface MessagesResponse {
    status: string
    data: Message[]
    pagination: {
        total: number
        limit: number
        offset: number
        hasMore: boolean
    }
}

export async function getMessages(
    apiKey: string,
    apiSecret: string,
    opts: { number?: string; limit?: number; isOutbound?: boolean }
): Promise<MessagesResponse> {
    const params = new URLSearchParams()
    params.set('limit', String(opts.limit || 10))
    params.set('order_by', 'createdAt')
    params.set('order_direction', 'desc')
    if (opts.number) params.set('number', opts.number)
    if (opts.isOutbound !== undefined) params.set('is_outbound', String(opts.isOutbound))

    const res = await fetch(`${API_BASE}/api/v2/messages?${params}`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to get messages (${res.status})`)
    }

    return res.json() as Promise<MessagesResponse>
}

// --- Typing indicator ---

export async function sendTypingIndicator(
    apiKey: string,
    apiSecret: string,
    number: string,
    fromNumber?: string
): Promise<void> {
    const body: Record<string, string> = { number }
    if (fromNumber) body.from_number = fromNumber

    const res = await fetch(`${API_BASE}/api/send-typing-indicator`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to send typing indicator (${res.status})`)
    }
}

// --- Group messaging ---

export async function sendGroupMessage(
    apiKey: string,
    apiSecret: string,
    numbers: string[],
    content: string,
    fromNumber?: string,
    mediaUrl?: string
): Promise<SendMessageResponse> {
    const body: Record<string, unknown> = { numbers, content }
    if (fromNumber) body.from_number = fromNumber
    if (mediaUrl) body.media_url = mediaUrl

    const res = await fetch(`${API_BASE}/api/send-group-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to send group message (${res.status})`)
    }

    return res.json() as Promise<SendMessageResponse>
}

// --- Lines ---

export async function getLines(
    apiKey: string,
    apiSecret: string
): Promise<{ numbers: string[] }> {
    const res = await fetch(`${API_BASE}/api/lines`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to get lines (${res.status})`)
    }

    return res.json() as Promise<{ numbers: string[] }>
}

// --- Webhooks ---

interface Webhook {
    url: string
    type: string
}

interface WebhooksRawResponse {
    webhooks: Record<string, string[]>
    [key: string]: unknown
}

export async function getWebhooks(
    apiKey: string,
    apiSecret: string
): Promise<{ webhooks: Webhook[] }> {
    const res = await fetch(`${API_BASE}/api/account/webhooks`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to get webhooks (${res.status})`)
    }

    const raw = await res.json() as WebhooksRawResponse
    const webhooks: Webhook[] = []
    for (const [type, urls] of Object.entries(raw.webhooks || {})) {
        for (const url of urls) {
            webhooks.push({ url, type })
        }
    }
    return { webhooks }
}

export async function addWebhook(
    apiKey: string,
    apiSecret: string,
    url: string,
    type: string
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/account/webhooks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify({ webhooks: [url], type })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to add webhook (${res.status})`)
    }
}

export async function deleteWebhook(
    apiKey: string,
    apiSecret: string,
    url: string,
    type: string
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/account/webhooks`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify({ webhooks: [url], type })
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.error as string) || (body.message as string) || `Failed to delete webhook (${res.status})`)
    }
}

// --- TOTP ---

export interface TotpSecret {
    id: string
    label: string
    issuer: string | null
    algorithm: string
    digits: number
    period: number
    created_at: string
}

export async function totpAddSecret(
    apiKey: string,
    apiSecret: string,
    opts: { label?: string; uri?: string; secret?: string; issuer?: string }
): Promise<TotpSecret & { secret: string }> {
    const res = await fetch(`${API_BASE}/api/v2/totp/secrets`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        },
        body: JSON.stringify(opts)
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to add TOTP secret (${res.status})`)
    }
    const data = await res.json() as { totp_secret: TotpSecret & { secret: string } }
    return data.totp_secret
}

export async function totpListSecrets(
    apiKey: string,
    apiSecret: string
): Promise<TotpSecret[]> {
    const res = await fetch(`${API_BASE}/api/v2/totp/secrets`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to list TOTP secrets (${res.status})`)
    }
    const data = await res.json() as { totp_secrets: TotpSecret[] }
    return data.totp_secrets
}

export async function totpGetCode(
    apiKey: string,
    apiSecret: string,
    secretId: string
): Promise<{ status: string; code: string; expires_in: number }> {
    const res = await fetch(`${API_BASE}/api/v2/totp/code/${secretId}`, {
        method: 'GET',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to get TOTP code (${res.status})`)
    }
    return res.json() as Promise<{ status: string; code: string; expires_in: number }>
}

export async function totpDeleteSecret(
    apiKey: string,
    apiSecret: string,
    secretId: string
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/v2/totp/secrets/${secretId}`, {
        method: 'DELETE',
        headers: {
            'sb-api-key-id': apiKey,
            'sb-api-secret-key': apiSecret
        }
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((body.message as string) || (body.error as string) || `Failed to delete TOTP secret (${res.status})`)
    }
}

export async function testKeys(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/account`, {
            method: 'GET',
            headers: {
                'sb-api-key-id': apiKey,
                'sb-api-secret-key': apiSecret
            }
        })
        return res.ok
    } catch {
        return false
    }
}
