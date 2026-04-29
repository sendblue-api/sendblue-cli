import prompts from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { getCredentials, saveCredentials, credentialsPath } from '../lib/config.js'
import { sendCode, verifyLogin } from '../lib/api.js'
import { printError, printLogo, formatPhoneNumber } from '../lib/format.js'

const onCancel = () => {
    console.log()
    printError('Login cancelled.')
    process.exit(0)
}

export async function loginCommand(): Promise<void> {
    console.log()
    printLogo()
    console.log(chalk.bold('  sendblue login'))
    console.log(chalk.dim('  Log in to an existing Sendblue account'))
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
            companyName: result.companyName,
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
