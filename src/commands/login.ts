import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { getCredentials, saveCredentials, credentialsPath } from '../lib/config.js'
import { sendCode, verifyLogin, phoneLoginStart, PhoneActionError, withTransientRetry } from '../lib/api.js'
import { printError, printLogo, formatPhoneNumber, normalizeNumber } from '../lib/format.js'
import {
    printChallengeInstructions,
    printVerifiedAccount,
    runPhoneCheckCommand,
    saveVerifiedCredentials,
    storePendingVerification,
    toPending,
    waitForPhoneVerification
} from '../lib/phone-verify.js'

const onCancel = () => {
    console.log()
    printError('Login cancelled.')
    process.exit(0)
}

interface LoginOptions {
    phone?: string
    account?: string
    company?: string
    check?: string | boolean
    wait?: boolean
}

export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
    if (opts.account && opts.company && opts.account !== opts.company) {
        printError('Use either --account or --company (they are aliases), not both with different values.')
        process.exit(1)
    }
    if (!opts.account && opts.company) opts.account = opts.company

    if (opts.check !== undefined && opts.phone) {
        printError('Use --check alone (it finishes a pending verification) or --phone (it starts a new one), not both.')
        process.exit(1)
    }
    if (opts.check !== undefined) {
        const sessionId = typeof opts.check === 'string' ? opts.check : undefined
        return runPhoneCheckCommand(sessionId, 'login')
    }
    if (opts.wait === false && !opts.phone) {
        printError('--no-wait only applies to phone verification. Add --phone <number>.')
        process.exit(1)
    }

    if (opts.phone) {
        return phoneLoginFlow(opts)
    }

    console.log()
    printLogo()
    console.log(chalk.bold('  sendblue login'))
    console.log(chalk.dim('  Log in to an existing Sendblue account'))
    console.log(chalk.dim('  Tip: log in without email using `sendblue login --phone <your-number>`'))
    console.log()

    // Check for existing credentials
    const existing = getCredentials()
    if (existing) {
        const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: `You already have an account configured (${existing.email}). Overwrite?`,
            initial: false
        }, { onCancel })
        if (!overwrite) {
            console.log(chalk.dim('  Login cancelled.'))
            return
        }
    }

    // Step 1: Collect email
    const { email } = await prompts({
        type: 'text',
        name: 'email',
        message: 'Email',
        validate: (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v) || 'Enter a valid email'
    }, { onCancel })

    // Step 2: Send verification code
    const sendSpinner = ora({ text: 'Sending verification code...', indent: 2 }).start()

    try {
        await sendCode(email)
        sendSpinner.succeed(`Code sent to ${email}`)
    } catch (err) {
        sendSpinner.fail(`Failed to send code: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }

    console.log()

    // Step 3: Enter code
    const { code } = await prompts({
        type: 'text',
        name: 'code',
        message: 'Verification code',
        validate: (v: string) => /^\d{8}$/.test(v) || 'Enter the 8-digit code from your email'
    }, { onCancel })

    // Step 4: Verify code + look up existing account
    const loginSpinner = ora({ text: 'Logging in...', indent: 2 }).start()

    try {
        const result = await verifyLogin(email, code)

        loginSpinner.succeed('Logged in!')

        saveCredentials({
            apiKey: result.apiKey,
            apiSecret: result.apiSecret,
            email: result.email,
            assignedNumber: result.assignedNumber,
            plan: result.plan,
            createdAt: new Date().toISOString()
        })

        console.log()
        console.log(`  ${chalk.bold('Email')}:         ${result.email}`)
        console.log(`  ${chalk.bold('Company')}:       ${result.companyName}`)
        if (result.assignedNumber) {
            console.log(`  ${chalk.bold('Phone Number')}:  ${formatPhoneNumber(result.assignedNumber)}`)
        }
        console.log(`  ${chalk.bold('Plan')}:          ${result.plan}`)
        console.log()
        console.log(chalk.dim(`  Credentials saved to ${credentialsPath()}`))
        console.log()
    } catch (err) {
        loginSpinner.fail(`Login failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function phoneLoginFlow(opts: LoginOptions): Promise<void> {
    const phoneNumber = normalizeNumber(opts.phone!)
    if (!/^\+\d{10,15}$/.test(phoneNumber)) {
        printError('Enter a valid phone number in E.164 format (e.g. +15551234567).')
        process.exit(1)
    }

    let account = opts.account?.trim().toLowerCase()
    if (account && !/^[a-z0-9_-]{3,64}$/.test(account)) {
        printError('Account name must be 3-64 characters: lowercase letters, numbers, hyphens, and underscores.')
        process.exit(1)
    }

    console.log()
    printLogo()
    console.log(chalk.bold('  sendblue login'))
    console.log(chalk.dim(`  Log in by verifying ${formatPhoneNumber(phoneNumber)} with a single text`))
    console.log()

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
                console.log(chalk.dim('  Login cancelled.'))
                return
            }
        } else {
            console.log(chalk.dim(`  Overwriting existing credentials (${existing.email}) once verified.`))
            console.log()
        }
    }

    const startSpinner = ora({ text: 'Starting phone verification...', indent: 2 }).start()
    let session
    try {
        session = await withTransientRetry(
            () => phoneLoginStart(phoneNumber, account),
            (err) => { startSpinner.text = `Connection hiccup — retrying... (${err.message})` }
        )
        startSpinner.succeed('Verification started.')
    } catch (err) {
        startSpinner.fail(err instanceof Error ? err.message : String(err))
        if (err instanceof PhoneActionError && err.status === 404) {
            console.log()
            console.log('  New to Sendblue? Create an account instead:')
            console.log(chalk.cyan(`    sendblue setup --phone ${phoneNumber} --company <name>`))
            console.log()
        }
        process.exit(1)
    }

    console.log()
    const pending = toPending('login', session)
    storePendingVerification(pending)
    await printChallengeInstructions(pending, { qr: true })

    if (opts.wait === false) {
        console.log('  When the text is sent, finish with:')
        console.log(chalk.cyan('    sendblue login --check'))
        console.log(chalk.dim('    (exit code 3 = still waiting)'))
        console.log()
        return
    }

    const result = await waitForPhoneVerification(pending)
    if (!result) {
        process.exit(1)
    }

    saveVerifiedCredentials(result, { clearPending: true })
    printVerifiedAccount(result, 'login', phoneNumber)
}
