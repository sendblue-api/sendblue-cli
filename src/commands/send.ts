import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { sendMessage } from '../lib/api.js'
import { normalizeNumber, printError } from '../lib/format.js'

interface SendOptions {
    media?: string
}

export async function sendCommand(number: string, message: string, opts: SendOptions): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const normalized = normalizeNumber(number)
    const spinner = ora({ text: `Sending to ${normalized}...`, indent: 2 }).start()

    try {
        const result = await sendMessage(creds.apiKey, creds.apiSecret, normalized, message, creds.assignedNumber, opts.media)
        spinner.succeed(`Message sent to ${normalized}`)
        if (result.messageId) {
            console.log(chalk.dim(`  Message ID: ${result.messageId}`))
        }
    } catch (err) {
        spinner.fail(`Send failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
