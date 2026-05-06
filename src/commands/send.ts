import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { sendMessage, uploadFile, getSharedContacts } from '../lib/api.js'
import { formatPhoneNumber, normalizeNumber, printError } from '../lib/format.js'
import { refreshCredentialsFromProvisioning } from '../lib/refresh.js'

interface SendOptions {
    media?: string
}

export async function sendCommand(number: string, message: string, opts: SendOptions): Promise<void> {
    let creds = getCredentials()
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
    creds = (await refreshCredentialsFromProvisioning(creds)).credentials

    const spinner = ora({ text: `Sending to ${normalized}...`, indent: 2 }).start()

    try {
        const result = await sendMessage(creds.apiKey, creds.apiSecret, normalized, message, creds.assignedNumber, mediaUrl)
        spinner.succeed(`Message sent to ${normalized}`)
        if (result.messageId) {
            console.log(chalk.dim(`  Message ID: ${result.messageId}`))
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        spinner.fail(`Send failed: ${msg}`)

        // Check if this is likely a verification issue and give actionable guidance
        try {
            const contacts = await getSharedContacts(creds.apiKey, creds.apiSecret)
            const match = contacts.contacts.find((c: { number: string }) => c.number === normalized || c.number === number)
            if (!match) {
                console.log()
                console.log(chalk.yellow(`  ${formatPhoneNumber(normalized)} is not in your contacts.`))
                console.log(`  Add them first: ${chalk.cyan(`sendblue add-contact ${normalized}`)}`)
                console.log()
            } else if (!match.verified) {
                console.log()
                console.log(chalk.yellow(`  ${formatPhoneNumber(normalized)} is not verified yet.`))
                if (contacts.sharedNumber) {
                    console.log(`  They need to text ${chalk.cyan(formatPhoneNumber(contacts.sharedNumber))} first.`)
                }
                console.log()
            }
        } catch {
            // Contacts check failed — just show the original error
        }
        process.exit(1)
    }
}
