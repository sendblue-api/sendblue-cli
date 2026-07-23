import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface SendblueCredentials {
    apiKey: string
    apiSecret: string
    email: string
    assignedNumber: string
    plan: string
    createdAt: string
}

const CONFIG_DIR = path.join(os.homedir(), '.sendblue')
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json')

export function getCredentials(): SendblueCredentials | null {
    try {
        const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
        return JSON.parse(data) as SendblueCredentials
    } catch {
        return null
    }
}

export function saveCredentials(creds: SendblueCredentials): void {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { mode: 0o700 })
    }
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
        mode: 0o600
    })
}

export function clearCredentials(): void {
    try {
        fs.unlinkSync(CREDENTIALS_FILE)
    } catch {
        // ignore if doesn't exist
    }
}

export function credentialsPath(): string {
    return CREDENTIALS_FILE
}

export interface PendingPhoneVerification {
    flow: 'login' | 'setup'
    sessionId: string
    phoneNumber: string
    sharedNumber: string
    challenge: string
    expiresAt: string
}

const PENDING_FILE = path.join(CONFIG_DIR, 'pending-verification.json')

export function savePendingVerification(pending: PendingPhoneVerification): void {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { mode: 0o700 })
    }
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), {
        mode: 0o600
    })
}

export function getPendingVerification(): PendingPhoneVerification | null {
    try {
        const data = fs.readFileSync(PENDING_FILE, 'utf-8')
        return JSON.parse(data) as PendingPhoneVerification
    } catch {
        return null
    }
}

export function clearPendingVerification(): void {
    try {
        fs.unlinkSync(PENDING_FILE)
    } catch {
        // ignore if doesn't exist
    }
}
