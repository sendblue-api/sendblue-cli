import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { sendTypingIndicator } from '../lib/api.js'
import { normalizeNumber, printError } from '../lib/format.js'

export async function typingCommand(number: string): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const normalized = normalizeNumber(number)
    const spinner = ora({ text: `Sending typing indicator to ${normalized}...`, indent: 2 }).start()

    try {
        await sendTypingIndicator(creds.apiKey, creds.apiSecret, normalized, creds.assignedNumber)
        spinner.succeed(`Typing indicator sent to ${normalized}`)
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
