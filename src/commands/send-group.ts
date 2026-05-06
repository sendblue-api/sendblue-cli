import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { sendGroupMessage } from '../lib/api.js'
import { normalizeNumber, formatPhoneNumber, printError } from '../lib/format.js'
import { refreshCredentialsFromProvisioning } from '../lib/refresh.js'

interface SendGroupOptions {
    media?: string
}

export async function sendGroupCommand(numbers: string[], opts: SendGroupOptions): Promise<void> {
    let creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    // Last argument is the message, rest are numbers
    if (numbers.length < 3) {
        printError('Usage: sendblue send-group <number1> <number2> [number3...] <message>')
        printError('At least 2 phone numbers and a message are required.')
        process.exit(1)
    }

    const message = numbers[numbers.length - 1]
    const phoneNumbers = numbers.slice(0, -1).map(normalizeNumber)
    creds = (await refreshCredentialsFromProvisioning(creds)).credentials

    const spinner = ora({ text: `Sending group message to ${phoneNumbers.length} recipients...`, indent: 2 }).start()

    try {
        const result = await sendGroupMessage(
            creds.apiKey, creds.apiSecret,
            phoneNumbers, message,
            creds.assignedNumber,
            opts.media
        )
        spinner.succeed(`Group message sent to ${phoneNumbers.length} recipients`)
        console.log(chalk.dim(`  Recipients: ${phoneNumbers.map(formatPhoneNumber).join(', ')}`))
        if (result.messageId) {
            console.log(chalk.dim(`  Message ID: ${result.messageId}`))
        }
    } catch (err) {
        spinner.fail(`Send failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
