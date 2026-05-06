import { spawn } from 'node:child_process'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { getCredentials, saveCredentials } from '../lib/config.js'
import { createCheckoutSession, getProvisioningStatus } from '../lib/api.js'
import { formatPhoneNumber, printError } from '../lib/format.js'

interface UpgradeOptions {
    noOpen?: boolean
    poll?: boolean
}

const onCancel = () => {
    console.log()
    printError('Upgrade cancelled.')
    process.exit(0)
}

function openUrl(url: string): Promise<boolean> {
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open'

    const args = process.platform === 'win32'
        ? ['/c', 'start', '', url]
        : [url]

    return new Promise(resolve => {
        let settled = false
        const finish = (opened: boolean) => {
            if (!settled) {
                settled = true
                resolve(opened)
            }
        }

        try {
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore'
            })
            child.once('error', () => finish(false))
            child.once('exit', code => finish(code === 0))
            const timer = setTimeout(() => {
                child.unref()
                finish(true)
            }, 1000)
            timer.unref()
        } catch {
            finish(false)
        }
    })
}

async function pollProvisioning(accountId: string): Promise<string | null> {
    const spinner = ora({ text: 'Waiting for your dedicated number...', indent: 2 }).start()
    const timeoutMs = 10 * 60 * 1000
    const pollMs = 10 * 1000
    const startedAt = Date.now()
    let consecutiveErrors = 0

    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, pollMs))

        try {
            const status = await getProvisioningStatus(accountId)
            consecutiveErrors = 0
            if (status.status === 'complete') {
                spinner.succeed('Dedicated number provisioned!')
                return status.newNumber || null
            }
        } catch (err) {
            consecutiveErrors += 1
            if (consecutiveErrors >= 3) {
                const message = err instanceof Error ? err.message : String(err)
                spinner.fail(`Provisioning status check failed: ${message}`)
                return null
            }
        }
    }

    spinner.info('Checkout may still be provisioning. Run `sendblue status` in a few minutes.')
    return null
}

export async function upgradeCommand(opts: UpgradeOptions): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` or `sendblue login` first.')
        process.exit(1)
    }

    if (!creds.companyName) {
        printError('This credential file is missing the Sendblue account name. Run `sendblue login` once, then try `sendblue upgrade` again.')
        process.exit(1)
    }

    console.log()
    console.log(chalk.bold('  Upgrade Sendblue'))
    console.log()
    console.log(`  ${chalk.bold('Account')}: ${creds.companyName}`)
    console.log(`  ${chalk.bold('Email')}:   ${creds.email}`)
    console.log(`  ${chalk.bold('Plan')}:    ${creds.plan}`)
    console.log()
    console.log(chalk.dim('  This opens Stripe Checkout for the AI agent plan.'))
    console.log(chalk.dim('  Link appears in Checkout when it is enabled for Sendblue in Stripe.'))
    console.log()

    if (creds.plan !== 'free_api') {
        const { continueUpgrade } = await prompts({
            type: 'confirm',
            name: 'continueUpgrade',
            message: `Your saved plan is ${creds.plan}. Open checkout anyway?`,
            initial: false
        }, { onCancel })

        if (!continueUpgrade) {
            console.log(chalk.dim('  Upgrade cancelled.'))
            return
        }
    }

    const checkoutSpinner = ora({ text: 'Creating checkout session...', indent: 2 }).start()

    let url: string
    try {
        const checkout = await createCheckoutSession(creds.email, creds.companyName)
        url = checkout.url
        checkoutSpinner.succeed('Checkout session created.')
    } catch (err) {
        checkoutSpinner.fail(`Failed to create checkout: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }

    console.log()
    console.log(`  ${chalk.bold('Checkout')}: ${chalk.cyan(url)}`)

    if (!opts.noOpen) {
        const opened = await openUrl(url)
        if (opened) {
            console.log(chalk.dim('  Opened checkout in your browser.'))
        } else {
            console.log(chalk.dim('  Could not open a browser automatically. Open the checkout URL above.'))
        }
    }

    console.log()
    console.log(chalk.dim('  Pay with Link in Stripe Checkout if it is available for your email.'))
    console.log()

    if (!opts.poll) {
        console.log(chalk.dim('  After checkout completes, run `sendblue status` to refresh your plan.'))
        console.log(chalk.dim('  Or run `sendblue upgrade --poll` to wait for provisioning.'))
        console.log()
        return
    }

    const newNumber = await pollProvisioning(creds.companyName)
    if (newNumber) {
        saveCredentials({
            ...creds,
            assignedNumber: newNumber,
            plan: 'inbound_only'
        })

        console.log()
        console.log(`  ${chalk.bold('New Number')}: ${formatPhoneNumber(newNumber)}`)
        console.log(`  ${chalk.bold('Plan')}:       inbound_only`)
        console.log()
        console.log(chalk.dim('  Credentials updated.'))
        console.log()
    }
}
