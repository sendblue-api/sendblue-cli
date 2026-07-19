import chalk from 'chalk'
import ora from 'ora'
import qrcode from 'qrcode-terminal'
import type { PhoneChallengeSession, SetupResponse } from './api.js'
import { phoneLoginCheck, phoneSetupCheck } from './api.js'
import {
    PendingPhoneVerification,
    clearPendingVerification,
    credentialsPath,
    getPendingVerification,
    savePendingVerification,
    saveCredentials
} from './config.js'
import { formatPhoneNumber, printError } from './format.js'

const POLL_INTERVAL_MS = 3000
// Server sessions live ~10 minutes; small grace so we don't give up before it does.
const POLL_GRACE_MS = 15 * 1000

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
        console.log(`  Agents: relay the exact phrase and number above to the user now.`)
        console.log(`  Resume anytime with: sendblue ${pending.flow} --check`)
        console.log()
    }
}

function checkFn(flow: 'login' | 'setup'): (sessionId: string) => Promise<SetupResponse | null> {
    return flow === 'login' ? phoneLoginCheck : phoneSetupCheck
}

export function printVerifiedAccount(result: SetupResponse, flow: 'login' | 'setup', userPhone: string): void {
    console.log()
    console.log(`  ${chalk.bold('Account')}:       ${result.companyName || result.email}`)
    if (result.assignedNumber) {
        console.log(`  ${chalk.bold('Phone Number')}:  ${formatPhoneNumber(result.assignedNumber)}`)
    }
    console.log(`  ${chalk.bold('Plan')}:          ${result.plan}`)
    console.log(`  ${chalk.bold('API Key')}:       ${result.apiKey}`)
    console.log(`  ${chalk.bold('API Secret')}:    ${'•'.repeat(Math.min(result.apiSecret.length - 4, 20))}${result.apiSecret.slice(-4)}`)
    console.log()
    console.log(chalk.dim(`  Credentials saved to ${credentialsPath()}`))
    console.log()
    if (flow === 'setup') {
        console.log('  Your phone is already a verified contact — try it:')
    } else {
        console.log('  Send a message:')
    }
    console.log(chalk.cyan(`    sendblue send ${userPhone} 'Hello from Sendblue!'`))
    console.log()
}

export function saveVerifiedCredentials(result: SetupResponse): void {
    saveCredentials({
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
        email: result.email,
        assignedNumber: result.assignedNumber,
        plan: result.plan,
        createdAt: new Date().toISOString()
    })
    clearPendingVerification()
}

export async function waitForPhoneVerification(pending: PendingPhoneVerification): Promise<SetupResponse | null> {
    const check = checkFn(pending.flow)
    const deadline = new Date(pending.expiresAt).getTime() + POLL_GRACE_MS
    const spinner = ora({
        text: `Waiting for your text to ${formatPhoneNumber(pending.sharedNumber)}...`,
        indent: 2
    }).start()

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        try {
            const result = await check(pending.sessionId)
            if (result) {
                spinner.succeed('Phone verified!')
                return result
            }
            const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
            spinner.text = `Waiting for your text to ${formatPhoneNumber(pending.sharedNumber)}... (${Math.floor(remaining / 60)}m ${remaining % 60}s left)`
        } catch (err) {
            spinner.fail(err instanceof Error ? err.message : String(err))
            clearPendingVerification()
            process.exit(1)
        }
    }

    spinner.info('Timed out waiting for your text.')
    console.log()
    console.log('  Already sent it? Check again with:')
    console.log(chalk.cyan(`    sendblue ${pending.flow} --check`))
    console.log()
    console.log('  Or start over:')
    console.log(chalk.cyan(pending.flow === 'setup'
        ? '    sendblue setup --phone <number> --company <name>'
        : '    sendblue login --phone <number>'))
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
            printError('No pending phone verification found. Start one with `sendblue login --phone <number>` or `sendblue setup --phone <number> --company <name>`.')
            process.exit(1)
        }
        sessionId = pending.sessionId
        flow = pending.flow
    } else if (pending && pending.sessionId === sessionId) {
        flow = pending.flow
    }

    let result: SetupResponse | null
    try {
        result = await checkFn(flow)(sessionId)
    } catch (err) {
        // Expired or consumed sessions are unrecoverable — clear the stale state.
        if (pending && pending.sessionId === sessionId) {
            clearPendingVerification()
        }
        printError(err instanceof Error ? err.message : String(err))
        process.exit(1)
    }

    if (!result) {
        if (pending && pending.sessionId === sessionId) {
            console.log(chalk.dim(`  Still waiting — text "${pending.challenge}" from ${formatPhoneNumber(pending.phoneNumber)} to ${formatPhoneNumber(pending.sharedNumber)}.`))
        } else {
            console.log(chalk.dim('  Still waiting for the verification text.'))
        }
        process.exit(PENDING_EXIT_CODE)
    }

    const userPhone = pending && pending.sessionId === sessionId ? pending.phoneNumber : '<your-phone>'
    saveVerifiedCredentials(result)
    console.log(chalk.green(flow === 'setup' ? '  Phone verified — account ready!' : '  Phone verified — logged in!'))
    printVerifiedAccount(result, flow, userPhone)
}
