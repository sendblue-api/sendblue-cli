import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { getWebhooks, addWebhook, deleteWebhook } from '../lib/api.js'
import { printError } from '../lib/format.js'

const VALID_TYPES = ['receive', 'outbound', 'call_log', 'line_blocked', 'line_assigned', 'contact_created']

export async function webhooksListCommand(): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Fetching webhooks...', indent: 2 }).start()

    try {
        const result = await getWebhooks(creds.apiKey, creds.apiSecret)
        spinner.stop()

        console.log()
        console.log(chalk.bold('  Webhooks'))
        console.log()

        if (!result.webhooks || result.webhooks.length === 0) {
            console.log(chalk.dim('  No webhooks configured.'))
            console.log()
            console.log(chalk.dim('  Add one with:'))
            console.log(chalk.cyan('    sendblue webhooks add <url> --type receive'))
        } else {
            for (const wh of result.webhooks) {
                const type = wh.type ? chalk.dim(` (${wh.type})`) : ''
                console.log(`  ${chalk.cyan(wh.url)}${type}`)
            }
        }
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export async function webhooksAddCommand(url: string, opts: { type: string }): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    if (!VALID_TYPES.includes(opts.type)) {
        printError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
        process.exit(1)
    }

    const spinner = ora({ text: 'Adding webhook...', indent: 2 }).start()

    try {
        await addWebhook(creds.apiKey, creds.apiSecret, url, opts.type)
        spinner.succeed(`Webhook added: ${url} (${opts.type})`)
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export async function webhooksRemoveCommand(url: string, opts: { type: string }): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    if (!VALID_TYPES.includes(opts.type)) {
        printError(`Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`)
        process.exit(1)
    }

    const spinner = ora({ text: 'Removing webhook...', indent: 2 }).start()

    try {
        await deleteWebhook(creds.apiKey, creds.apiSecret, url, opts.type)
        spinner.succeed(`Webhook removed: ${url} (${opts.type})`)
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
