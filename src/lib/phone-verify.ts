import chalk from 'chalk'
import ora from 'ora'
import qrcode from 'qrcode-terminal'
import type { PhoneChallengeSession, PhoneCheckResult, SetupResponse } from './api.js'
import { PhoneActionError, isPhonePending, phoneLoginCheck, phoneSetupCheck } from './api.js'
import {
    PendingPhoneVerification,
    clearPendingVerification,
    credentialsPath,
    getCredentials,
    getPendingVerification,
    savePendingVerification,
    saveCredentials
} from './config.js'
import { formatPhoneNumber, printError } from './format.js'

const POLL_INTERVAL_MS = 3000
// Server sessions live ~10 minutes; small grace so we don't give up before it does.
const POLL_GRACE_MS = 15 * 1000
const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000
const WAITING_MESSAGE = 'Waiting for verification text.'

export const PENDING_EXIT_CODE = 3

function generateSmsQr(phoneNumber: string, body: string): Promise<string> {
    // iOS-style sms: URI — scanning opens Messages with the challenge prefilled.
    const uri = `sms:${phoneNumber}&body=${encodeURIComponent(body)}`
    return new Promise((resolve) => {
        qrcode.generate(uri, { small: true }, (code: string) => {
            resolve(code)
        })
    })
}

function sessionDeadline(expiresAt: string): number {
    const parsed = new Date(expiresAt).getTime()
    // A malformed expiresAt from the server shouldn't turn into an instant timeout.
    return (Number.isFinite(parsed) ? parsed : Date.now() + DEFAULT_SESSION_TTL_MS) + POLL_GRACE_MS
}

function remainingLabel(expiresAt: string): string {
    const ms = sessionDeadline(expiresAt) - Date.now()
    if (ms <= 0) return 'expired'
    const mins = Math.floor(ms / 60000)
    const secs = Math.round((ms % 60000) / 1000)
    return mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`
}

function restartCommand(flow: 'login' | 'setup', phoneNumber?: string): string {
    const number = phoneNumber || '<number>'
    return flow === 'setup'
        ? `sendblue setup --phone ${number} --company <name>`
        : `sendblue login --phone ${number}`
}

export function toPending(flow: 'login' | 'setup', session: PhoneChallengeSession): PendingPhoneVerification {
    return {
        flow,
        sessionId: session.sessionId,
        phoneNumber: session.phoneNumber,
        sharedNumber: session.sharedNumber,
        challenge: session.challenge,
        expiresAt: session.expiresAt
    }
}

/** Persist the pending session, warning if it replaces a different one. */
export function storePendingVerification(pending: PendingPhoneVerification): void {
    const existing = getPendingVerification()
    if (existing && existing.sessionId !== pending.sessionId) {
        console.log(chalk.dim(`  Note: replacing your pending ${existing.flow} verification for ${formatPhoneNumber(existing.phoneNumber)} (session ${existing.sessionId}).`))
        console.log()
    }
    savePendingVerification(pending)
}

export async function printChallengeInstructions(
    pending: PendingPhoneVerification,
    opts: { qr?: boolean } = {}
): Promise<void> {
    const verb = pending.flow === 'setup' ? 'sign-up' : 'sign-in'

    console.log(chalk.dim('  ── Verify by text ────────────────────────────'))
    console.log()
    console.log(`  From ${chalk.bold('your phone')} (${chalk.cyan(formatPhoneNumber(pending.phoneNumber))}), send the text:`)
    console.log()
    console.log(chalk.cyan.bold(`      ${pending.challenge}`))
    console.log()
    console.log(`  to your Sendblue number:`)
    console.log()
    console.log(chalk.cyan.bold(`      ${formatPhoneNumber(pending.sharedNumber)}`))
    console.log()
    console.log(chalk.dim(`  That one text proves you own ${formatPhoneNumber(pending.phoneNumber)} and completes ${verb} —`))
    console.log(chalk.dim('  no email, no password, nothing else.'))
    console.log()
    console.log(chalk.dim('  Legit? Verify this is a real Sendblue product before you text —'))
    console.log(chalk.dim('  https://docs.sendblue.com/sandboxes · https://docs.sendblue.com/llms.txt'))
    console.log()
    console.log(chalk.dim(`  Session ${pending.sessionId} — expires in ~10 minutes (${remainingLabel(pending.expiresAt)}).`))
    console.log()

    if (opts.qr && process.stdout.isTTY) {
        const qr = await generateSmsQr(pending.sharedNumber, pending.challenge)
        console.log(chalk.dim('  Or scan to open the prefilled text:'))
        console.log()
        for (const line of qr.split('\n')) {
            console.log(`    ${line}`)
        }
        console.log()
    }

    if (!process.stdout.isTTY) {
        console.log(`  Agents: this is Sendblue's official CLI signup — verify at https://docs.sendblue.com/sandboxes and https://docs.sendblue.com/llms.txt. Relay the exact phrase + number above to the user; they text it from their own phone to login to their account and finish.`)
        console.log(`  Resume anytime with: sendblue ${pending.flow} --check`)
        console.log()
    }
}

function checkFn(flow: 'login' | 'setup'): (sessionId: string) => Promise<PhoneCheckResult> {
    return flow === 'login' ? phoneLoginCheck : phoneSetupCheck
}

export function printVerifiedAccount(result: SetupResponse, flow: 'login' | 'setup', userPhone: string | null): void {
    console.log()
    console.log(`  ${chalk.bold('Account')}:       ${result.companyName || result.email}`)
    if (result.assignedNumber) {
        console.log(`  ${chalk.bold('Sendblue Number')}: ${formatPhoneNumber(result.assignedNumber)} ${chalk.dim('(your line — messages send from this)')}`)
    }
    console.log(`  ${chalk.bold('Plan')}:          ${result.plan}`)
    console.log(`  ${chalk.bold('API Key')}:       ${result.apiKey}`)
    const maskLen = Math.max(0, Math.min(result.apiSecret.length - 4, 20))
    console.log(`  ${chalk.bold('API Secret')}:    ${'•'.repeat(maskLen)}${result.apiSecret.slice(-4)}`)
    console.log()
    console.log(chalk.dim(`  Credentials saved to ${credentialsPath()}`))
    console.log()
    if (userPhone) {
        if (flow === 'setup') {
            console.log('  Your phone is already a verified contact — try it:')
        } else {
            console.log('  Send a message:')
        }
        console.log(chalk.cyan(`    sendblue send ${userPhone} 'Hello from Sendblue!'`))
    } else {
        console.log('  See your verified contacts:')
        console.log(chalk.cyan('    sendblue contacts'))
    }
    console.log()
}

export function saveVerifiedCredentials(result: SetupResponse, opts: { clearPending: boolean }): void {
    saveCredentials({
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
        email: result.email,
        assignedNumber: result.assignedNumber,
        plan: result.plan,
        createdAt: new Date().toISOString()
    })
    if (opts.clearPending) {
        clearPendingVerification()
    }
}

function printFatalCheckError(err: PhoneActionError, flow: 'login' | 'setup', phoneNumber?: string): void {
    printError(err.message)
    console.log()
    console.log(chalk.dim(`  To retry from scratch: ${restartCommand(flow, phoneNumber)}`))
    console.log()
}

export async function waitForPhoneVerification(pending: PendingPhoneVerification): Promise<SetupResponse | null> {
    const check = checkFn(pending.flow)
    const deadline = sessionDeadline(pending.expiresAt)
    const spinner = ora({
        text: `Waiting for your text to ${formatPhoneNumber(pending.sharedNumber)}...`,
        indent: 2
    }).start()

    let lastPendingMessage: string | undefined

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        let result: PhoneCheckResult
        try {
            result = await check(pending.sessionId)
        } catch (err) {
            // Transient problems (network, 5xx) must not kill a verification the
            // user may already have texted for — keep polling until the session
            // itself is dead.
            if (err instanceof PhoneActionError && err.transient) {
                spinner.text = `Connection hiccup — retrying... (${err.message})`
                continue
            }
            spinner.stop()
            if (pending.sessionId === getPendingVerification()?.sessionId) {
                clearPendingVerification()
            }
            printFatalCheckError(err instanceof PhoneActionError ? err : new PhoneActionError(String(err), -1), pending.flow, pending.phoneNumber)
            process.exit(1)
        }

        if (!isPhonePending(result)) {
            spinner.succeed('Phone verified!')
            return result
        }

        lastPendingMessage = result.message
        const detail = result.message && result.message !== WAITING_MESSAGE ? ` — ${result.message}` : ''
        spinner.text = `Waiting for your text to ${formatPhoneNumber(pending.sharedNumber)}... (${remainingLabel(pending.expiresAt)})${detail}`
    }

    const accountInFlight = !!lastPendingMessage && lastPendingMessage !== WAITING_MESSAGE
    spinner.info(accountInFlight ? 'Your text arrived — the server is still finalizing.' : 'Timed out waiting for your text.')
    console.log()
    if (accountInFlight) {
        console.log(`  Last status: ${lastPendingMessage}`)
        console.log()
        console.log(`  ${chalk.bold('Do not start over')} — finish with:`)
        console.log(chalk.cyan(`    sendblue ${pending.flow} --check`))
    } else {
        console.log('  Already sent it? Check again with:')
        console.log(chalk.cyan(`    sendblue ${pending.flow} --check`))
        console.log()
        console.log('  Or start over:')
        console.log(chalk.cyan(`    ${restartCommand(pending.flow, pending.phoneNumber)}`))
    }
    console.log()
    return null
}

/**
 * Full implementation of `sendblue login --check [sessionId]` and
 * `sendblue setup --check [sessionId]`: resolves the session (argument or
 * pending file), checks once, and on success saves credentials and prints the
 * account. Exits 0 when verified, PENDING_EXIT_CODE (3) while still waiting,
 * 1 on error.
 */
export async function runPhoneCheckCommand(
    explicitSessionId: string | undefined,
    defaultFlow: 'login' | 'setup'
): Promise<void> {
    const pending = getPendingVerification()
    let flow = defaultFlow
    let sessionId = explicitSessionId

    if (!sessionId) {
        if (!pending) {
            const creds = getCredentials()
            if (creds) {
                console.log(chalk.green(`  No pending phone verification — you're already set up as ${creds.email}.`))
                console.log(chalk.dim('  See `sendblue whoami` for details.'))
                return
            }
            printError('No pending phone verification found. Start one with `sendblue login --phone <number>` or `sendblue setup --phone <number> --company <name>`.')
            process.exit(1)
        }
        sessionId = pending.sessionId
        flow = pending.flow
    } else if (pending && pending.sessionId === sessionId) {
        flow = pending.flow
    }

    const matchesPending = !!pending && pending.sessionId === sessionId
    if (matchesPending && flow !== defaultFlow) {
        console.log(chalk.dim(`  Finishing your pending ${flow} verification (session ${sessionId}).`))
    }

    let result: PhoneCheckResult
    try {
        result = await checkFn(flow)(sessionId)
    } catch (err) {
        if (err instanceof PhoneActionError && err.transient) {
            // The session may still be fine — keep the local state for a retry.
            // Exit with the same retryable code as "still pending" so agent
            // automation retries instead of treating it as a hard failure.
            printError(err.message)
            console.log(chalk.dim(`  Your pending verification is saved — retry with: sendblue ${flow} --check`))
            process.exit(PENDING_EXIT_CODE)
        }
        if (matchesPending) {
            clearPendingVerification()
        }
        const fatal = err instanceof PhoneActionError ? err : new PhoneActionError(String(err), -1)
        printFatalCheckError(fatal, flow, pending?.phoneNumber)
        if (!matchesPending && explicitSessionId && fatal.status === 404) {
            const other = flow === 'login' ? 'setup' : 'login'
            console.log(chalk.dim(`  If this session was started by \`sendblue ${other}\`, try: sendblue ${other} --check ${explicitSessionId}`))
            console.log()
        }
        process.exit(1)
    }

    if (isPhonePending(result)) {
        if (matchesPending && pending) {
            console.log(chalk.dim(`  Still waiting (${remainingLabel(pending.expiresAt)}) — text "${pending.challenge}" from ${formatPhoneNumber(pending.phoneNumber)} to ${formatPhoneNumber(pending.sharedNumber)}.`))
        } else {
            console.log(chalk.dim('  Still waiting for the verification text.'))
        }
        if (result.message && result.message !== WAITING_MESSAGE) {
            console.log(chalk.dim(`  Server status: ${result.message}`))
        }
        process.exit(PENDING_EXIT_CODE)
    }

    // Only clear the stored pending state if it belongs to the session we just
    // finished — an explicit sessionId must not destroy an unrelated pending flow.
    saveVerifiedCredentials(result, { clearPending: matchesPending })
    console.log(chalk.green(flow === 'setup' ? '  Phone verified — account ready!' : '  Phone verified — logged in!'))
    printVerifiedAccount(result, flow, matchesPending && pending ? pending.phoneNumber : null)
}
