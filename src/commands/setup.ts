import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import qrcode from 'qrcode-terminal'
import { getCredentials, saveCredentials, credentialsPath } from '../lib/config.js'
import { sendCode, verifySetup, addContact, getSharedContacts, phoneSetupStart } from '../lib/api.js'
import { printCredentials, printError, printLogo, formatPhoneNumber, normalizeNumber } from '../lib/format.js'
import {
    printChallengeInstructions,
    printVerifiedAccount,
    runPhoneCheckCommand,
    saveVerifiedCredentials,
    storePendingVerification,
    toPending,
    waitForPhoneVerification
} from '../lib/phone-verify.js'

function generateSmsQr(phoneNumber: string): Promise<string> {
    return new Promise((resolve) => {
        qrcode.generate(`sms:${phoneNumber}`, { small: true }, (code: string) => {
            resolve(code)
        })
    })
}

const onCancel = () => {
    console.log()
    printError('Setup cancelled.')
    process.exit(0)
}

function stepHeader(step: number, total: number, title: string): void {
    console.log()
    console.log(chalk.dim(`  ── Step ${step}/${total} ──────────────────────────────`))
    console.log(chalk.bold(`  ${title}`))
    console.log()
}

function divider(): void {
    console.log()
}

interface SetupOptions {
    email?: string
    code?: string
    company?: string
    account?: string
    contact?: string
    phone?: string
    check?: string | boolean
    wait?: boolean
}

export async function setupCommand(opts: SetupOptions): Promise<void> {
    if (opts.company && opts.account && opts.company !== opts.account) {
        printError('Use either --company or --account (they are aliases), not both with different values.')
        process.exit(1)
    }
    if (!opts.company && opts.account) opts.company = opts.account

    if (opts.check !== undefined && opts.phone) {
        printError('Use --check alone (it finishes a pending verification) or --phone (it starts a new one), not both.')
        process.exit(1)
    }
    if (opts.check !== undefined) {
        const sessionId = typeof opts.check === 'string' ? opts.check : undefined
        return runPhoneCheckCommand(sessionId, 'setup')
    }
    if (opts.wait === false && !opts.phone) {
        printError('--no-wait only applies to phone verification. Add --phone <number>.')
        process.exit(1)
    }

    if (opts.phone) {
        if (opts.email || opts.code) {
            printError('Choose one verification method: --phone (verify by text) or --email/--code (verify by email).')
            process.exit(1)
        }
        return phoneSetupFlow(opts)
    }

    const nonInteractive = !!(opts.email && opts.code && opts.company)

    console.log()
    printLogo()
    console.log(chalk.bold('  Welcome to Sendblue'))
    console.log(chalk.dim('  Send and receive iMessages programmatically.'))
    console.log(chalk.dim('  Free to start — no credit card required.'))
    console.log(chalk.dim('  Tip: skip email entirely with `sendblue setup --phone <your-number> --company <name>`'))
    console.log()

    // Check for existing credentials
    const existing = getCredentials()
    if (existing) {
        if (nonInteractive) {
            console.log(chalk.dim(`  Overwriting existing account (${existing.email})`))
        } else {
            const { overwrite } = await prompts({
                type: 'confirm',
                name: 'overwrite',
                message: `You already have an account configured (${existing.email}). Overwrite?`,
                initial: false
            }, { onCancel })
            if (!overwrite) {
                console.log(chalk.dim('  Setup cancelled.'))
                return
            }
        }
    }

    // Validate flags upfront
    if (opts.email && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(opts.email)) {
        printError('Invalid email address.')
        process.exit(1)
    }
    if (opts.code && !/^\d{8}$/.test(opts.code)) {
        printError('Verification code must be 8 digits.')
        process.exit(1)
    }
    if (opts.company) {
        if (!/^[a-z0-9_-]+$/.test(opts.company)) {
            printError('Company name: only lowercase letters, numbers, hyphens, and underscores.')
            process.exit(1)
        }
        if (opts.company.length < 3 || opts.company.length > 64) {
            printError('Company name must be 3-64 characters.')
            process.exit(1)
        }
    }

    const totalSteps = 4

    // ─── Step 1: Email ───────────────────────────────────────────
    stepHeader(1, totalSteps, 'Enter your email')
    console.log(chalk.dim('  We\'ll send a one-time verification code.'))
    console.log()

    let email: string
    if (opts.email) {
        email = opts.email
        console.log(chalk.dim(`  Using: ${email}`))
    } else {
        const response = await prompts({
            type: 'text',
            name: 'email',
            message: 'Email address',
            validate: (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v) || 'Enter a valid email'
        }, { onCancel })
        email = response.email
    }

    // ─── Step 2: Verification ────────────────────────────────────
    if (!opts.code) {
        divider()
        const sendSpinner = ora({ text: 'Sending verification code...', indent: 2 }).start()

        try {
            await sendCode(email)
            sendSpinner.succeed(`Verification code sent to ${chalk.cyan(email)}`)
        } catch (err) {
            sendSpinner.fail(`Failed to send code: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
        }

        // Non-interactive: exit so user can re-run with --code
        if (opts.email) {
            console.log()
            console.log(chalk.dim('  Check your inbox, then re-run with the code:'))
            console.log(chalk.cyan(`    sendblue setup --email ${email} --code <CODE> --company <NAME>`))
            console.log()
            return
        }
    }

    stepHeader(2, totalSteps, 'Verify your email')
    console.log(chalk.dim('  Check your inbox for the 8-digit code.'))
    console.log()

    let code: string
    if (opts.code) {
        code = opts.code
        console.log(chalk.dim(`  Using provided code.`))
    } else {
        const response = await prompts({
            type: 'text',
            name: 'code',
            message: 'Verification code',
            validate: (v: string) => /^\d{8}$/.test(v) || 'Enter the 8-digit code from your email'
        }, { onCancel })
        code = response.code
    }

    // ─── Step 3: Account name ────────────────────────────────────
    stepHeader(3, totalSteps, 'Name your account')
    console.log(chalk.dim('  This is an internal identifier for your account (e.g. my-startup, my-ai-agent).'))
    console.log(chalk.dim('  Your contacts won\'t see this.'))
    console.log()

    let companyName: string
    if (opts.company) {
        companyName = opts.company
        console.log(chalk.dim(`  Using: ${opts.company}`))
    } else {
        const response = await prompts({
            type: 'text',
            name: 'companyName',
            message: 'Account name',
            validate: (v: string) => {
                if (!v) return 'Account name is required'
                if (!/^[a-z0-9_-]+$/.test(v)) return 'Lowercase letters, numbers, hyphens, and underscores only'
                if (v.length < 3 || v.length > 64) return 'Must be 3-64 characters'
                return true
            }
        }, { onCancel })
        companyName = response.companyName
    }

    // ─── Create account ──────────────────────────────────────────
    divider()
    const setupSpinner = ora({ text: 'Creating your Sendblue account...', indent: 2 }).start()

    let result
    try {
        result = await verifySetup(email, code, companyName)
        setupSpinner.succeed('Account created!')
    } catch (err) {
        setupSpinner.fail(`Setup failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }

    saveCredentials({
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
        email: result.email,
        assignedNumber: result.assignedNumber,
        plan: result.plan,
        createdAt: new Date().toISOString()
    })

    console.log()
    console.log(chalk.dim('  ── Your account ──────────────────────────────'))
    console.log()
    console.log(`  ${chalk.bold('Phone Number')}   ${chalk.cyan(formatPhoneNumber(result.assignedNumber))}`)
    console.log(`  ${chalk.bold('API Key')}        ${result.apiKey}`)
    console.log(`  ${chalk.bold('API Secret')}     ${'•'.repeat(Math.min(result.apiSecret.length - 4, 20))}${result.apiSecret.slice(-4)}`)
    console.log(`  ${chalk.bold('Plan')}           ${result.plan}`)
    console.log()
    console.log(chalk.dim(`  Credentials saved to ${credentialsPath()}`))

    // ─── Step 4: First contact ───────────────────────────────────
    stepHeader(4, totalSteps, 'Add your first contact')

    if (result.plan === 'free_api') {
        console.log(chalk.dim('  On the free plan, contacts must verify by texting your'))
        console.log(chalk.dim('  Sendblue number once before you can message them.'))
    } else {
        console.log(chalk.dim('  Enter the phone number you\'d like to message.'))
    }
    console.log()

    let contactNumber: string | undefined
    if (opts.contact) {
        contactNumber = opts.contact
    } else if (!nonInteractive) {
        const response = await prompts({
            type: 'text',
            name: 'contactNumber',
            message: 'Contact phone number (or press Enter to skip)',
            validate: (v: string) => {
                if (!v) return true // allow skip
                const n = normalizeNumber(v)
                return /^\+\d{10,15}$/.test(n) || 'Enter a valid phone number (e.g. 5551234567)'
            }
        }, { onCancel })
        contactNumber = response.contactNumber
    }

    if (!contactNumber) {
        // Skipped — show final summary
        console.log()
        console.log(chalk.dim('  ── All done! ─────────────────────────────────'))
        console.log()
        console.log('  You can add contacts anytime:')
        console.log(chalk.cyan('    sendblue add-contact +15551234567'))
        console.log()
        console.log('  Then send your first message:')
        console.log(chalk.cyan('    sendblue send +15551234567 \'Hello from Sendblue!\''))
        console.log()
        return
    }

    const normalized = normalizeNumber(contactNumber)
    const contactSpinner = ora({ text: `Adding ${formatPhoneNumber(normalized)}...`, indent: 2 }).start()

    try {
        const contact = await addContact(result.apiKey, result.apiSecret, normalized)

        if (contact.verified) {
            contactSpinner.succeed(`${formatPhoneNumber(normalized)} is verified and ready!`)
            console.log()
            console.log(chalk.dim('  ── You\'re all set! ───────────────────────────'))
            console.log()
            console.log('  Send your first message:')
            console.log(chalk.cyan(`    sendblue send ${normalized} 'Hello from Sendblue!'`))
            console.log()
            return
        }

        contactSpinner.succeed('Contact added — needs verification.')
        console.log()

        // Get the shared number for verification
        const contacts = await getSharedContacts(result.apiKey, result.apiSecret)
        const sharedNumber = contacts.sharedNumber || result.assignedNumber

        if (sharedNumber) {
            console.log(chalk.dim('  ── One more thing ────────────────────────────'))
            console.log()
            console.log(`  Have ${chalk.cyan(formatPhoneNumber(normalized))} send any text to:`)
            console.log()
            console.log(chalk.cyan.bold(`    ${formatPhoneNumber(sharedNumber)}`))
            console.log(chalk.dim('    (any message works — "hi" is fine)'))
            console.log()

            if (!nonInteractive) {
                const qr = await generateSmsQr(sharedNumber)
                console.log(chalk.dim('  Or scan to open a text:'))
                console.log()
                for (const line of qr.split('\n')) {
                    console.log(`    ${line}`)
                }
                console.log()

                // Poll for verification
                const verifySpinner = ora({ text: `Waiting for ${formatPhoneNumber(normalized)} to text your number...`, indent: 2 }).start()
                const POLL_INTERVAL = 3000
                const TIMEOUT = 10 * 60 * 1000
                const start = Date.now()
                let verified = false

                while (Date.now() - start < TIMEOUT) {
                    await new Promise(r => setTimeout(r, POLL_INTERVAL))
                    try {
                        const check = await getSharedContacts(result.apiKey, result.apiSecret)
                        const c = check.contacts.find(c => c.number === normalized || c.number === normalized.replace('+', ''))
                        if (c?.verified) {
                            verified = true
                            break
                        }
                    } catch {
                        // ignore polling errors, keep trying
                    }
                }

                if (verified) {
                    verifySpinner.succeed(`${formatPhoneNumber(normalized)} is verified!`)
                    console.log()
                    console.log(chalk.dim('  ── You\'re all set! ───────────────────────────'))
                    console.log()
                    console.log('  Send your first message:')
                    console.log(chalk.cyan(`    sendblue send ${normalized} 'Hello from Sendblue!'`))
                } else {
                    verifySpinner.info('Timed out — but your account is ready!')
                    console.log()
                    console.log('  Once your contact texts your number, send them a message:')
                    console.log(chalk.cyan(`    sendblue send ${normalized} 'Hello from Sendblue!'`))
                }
            } else {
                console.log('  Once verified, send your first message:')
                console.log(chalk.cyan(`    sendblue send ${normalized} 'Hello from Sendblue!'`))
            }
        }
        console.log()

    } catch (err) {
        contactSpinner.fail(`Failed to add contact: ${err instanceof Error ? err.message : String(err)}`)
        console.log()
        console.log(chalk.dim('  You can add contacts later:'))
        console.log(chalk.cyan('    sendblue add-contact +15551234567'))
        console.log()
    }
}

async function phoneSetupFlow(opts: SetupOptions): Promise<void> {
    const phoneNumber = normalizeNumber(opts.phone!)
    if (!/^\+\d{10,15}$/.test(phoneNumber)) {
        printError('Enter a valid phone number in E.164 format (e.g. +15551234567).')
        process.exit(1)
    }

    console.log()
    printLogo()
    console.log(chalk.bold('  Welcome to Sendblue'))
    console.log(chalk.dim(`  Sign up by verifying ${formatPhoneNumber(phoneNumber)} with a single text —`))
    console.log(chalk.dim('  no email, no password, no credit card.'))
    console.log()

    let companyName = opts.company?.trim().toLowerCase()
    if (companyName && !/^[a-z0-9_-]{3,64}$/.test(companyName)) {
        printError('Account name must be 3-64 characters: lowercase letters, numbers, hyphens, and underscores.')
        process.exit(1)
    }
    if (!companyName) {
        if (!process.stdin.isTTY) {
            printError('Missing --company. Usage: sendblue setup --phone <number> --company <account-name>')
            process.exit(1)
        }
        const response = await prompts({
            type: 'text',
            name: 'companyName',
            message: 'Account name (e.g. my-startup, my-ai-agent)',
            validate: (v: string) => {
                if (!v) return 'Account name is required'
                if (!/^[a-z0-9_-]+$/.test(v)) return 'Lowercase letters, numbers, hyphens, and underscores only'
                if (v.length < 3 || v.length > 64) return 'Must be 3-64 characters'
                return true
            }
        }, { onCancel })
        companyName = response.companyName as string
    }

    const existing = getCredentials()
    if (existing) {
        if (process.stdin.isTTY) {
            const { overwrite } = await prompts({
                type: 'confirm',
                name: 'overwrite',
                message: `You already have an account configured (${existing.email}). Overwrite?`,
                initial: false
            }, { onCancel })
            if (!overwrite) {
                console.log(chalk.dim('  Setup cancelled.'))
                return
            }
        } else {
            console.log(chalk.dim(`  Overwriting existing credentials (${existing.email}) once verified.`))
            console.log()
        }
    }

    const startSpinner = ora({ text: 'Reserving your account...', indent: 2 }).start()
    let session
    try {
        session = await phoneSetupStart(phoneNumber, companyName)
        startSpinner.succeed(`Account name ${chalk.cyan(companyName)} reserved.`)
    } catch (err) {
        startSpinner.fail(err instanceof Error ? err.message : String(err))
        process.exit(1)
    }

    console.log()
    const pending = toPending('setup', session)
    storePendingVerification(pending)
    await printChallengeInstructions(pending, { qr: true })

    if (opts.wait === false) {
        console.log('  When the text is sent, finish with:')
        console.log(chalk.cyan('    sendblue setup --check'))
        console.log(chalk.dim('    (exit code 3 = still waiting)'))
        console.log()
        return
    }

    const result = await waitForPhoneVerification(pending)
    if (!result) {
        process.exit(1)
    }

    saveVerifiedCredentials(result, { clearPending: true })
    console.log(chalk.green.bold('  Account created!'))
    printVerifiedAccount(result, 'setup', phoneNumber)
}
