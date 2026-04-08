import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { sendMessage, uploadFile } from '../lib/api.js'
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
    let mediaUrl = opts.media

    // Auto-upload local files
    if (mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
        const filePath = resolve(mediaUrl)
        if (!existsSync(filePath)) {
            printError(`File not found: ${mediaUrl}`)
            process.exit(1)
        }
        const uploadSpinner = ora({ text: 'Uploading file...', indent: 2 }).start()
        try {
            mediaUrl = await uploadFile(creds.apiKey, creds.apiSecret, filePath)
            uploadSpinner.succeed('File uploaded')
        } catch (err) {
            uploadSpinner.fail(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
            process.exit(1)
        }
    }

    const spinner = ora({ text: `Sending to ${normalized}...`, indent: 2 }).start()

    try {
        const result = await sendMessage(creds.apiKey, creds.apiSecret, normalized, message, creds.assignedNumber, mediaUrl)
        spinner.succeed(`Message sent to ${normalized}`)
        if (result.messageId) {
            console.log(chalk.dim(`  Message ID: ${result.messageId}`))
        }
    } catch (err) {
        spinner.fail(`Send failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
