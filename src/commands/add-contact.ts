import chalk from 'chalk'
import ora from 'ora'
import qrcode from 'qrcode-terminal'
import { getCredentials } from '../lib/config.js'
import { addContact, getSharedContacts } from '../lib/api.js'
import { formatPhoneNumber, normalizeNumber, printError } from '../lib/format.js'

function generateSmsQr(phoneNumber: string): Promise<string> {
    return new Promise((resolve) => {
        qrcode.generate(`sms:${phoneNumber}`, { small: true }, (code: string) => {
            resolve(code)
        })
    })
}

export async function addContactCommand(number: string): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` to create an account, or `sendblue login` if you already have one.')
        process.exit(1)
    }

    const normalized = normalizeNumber(number)
    const spinner = ora({ text: `Adding contact ${formatPhoneNumber(normalized)}...`, indent: 2 }).start()

    try {
        const result = await addContact(creds.apiKey, creds.apiSecret, normalized)

        if (result.verified) {
            spinner.succeed(`Contact ${formatPhoneNumber(normalized)} is already verified!`)
            console.log()
            console.log(chalk.bold('  You can now send messages:'))
            console.log(chalk.cyan(`    sendblue send ${normalized} 'Hello!'`))
            console.log()
            return
        }

        spinner.succeed('Contact added!')
        console.log()

        // Get the shared number
        const contacts = await getSharedContacts(creds.apiKey, creds.apiSecret)
        const sharedNumber = contacts.sharedNumber

        console.log(chalk.bold('  To verify this contact:'))
        console.log()
        if (sharedNumber) {
            console.log(`  Have ${formatPhoneNumber(normalized)} send any text to:`)
            console.log()
            console.log(chalk.cyan.bold(`    ${formatPhoneNumber(sharedNumber)}`))
            console.log()

            // Show QR code for easy texting
            const qr = await generateSmsQr(sharedNumber)
            console.log(chalk.dim('  Or scan to open a text:'))
            console.log()
            for (const line of qr.split('\n')) {
                console.log(`    ${line}`)
            }
            console.log()
            console.log(chalk.dim(`    (any message works — "hi" is fine)`))
        } else {
            console.log(`  Have ${formatPhoneNumber(normalized)} text your Sendblue number.`)
        }
        console.log()
        console.log(chalk.dim('  Once they text in, the contact is verified and you can send messages.'))
        console.log(chalk.dim(`  Check status with: sendblue contacts`))
        console.log()

    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export async function contactsCommand(): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` to create an account, or `sendblue login` if you already have one.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Fetching contacts...', indent: 2 }).start()

    try {
        const result = await getSharedContacts(creds.apiKey, creds.apiSecret)
        spinner.stop()

        console.log()
        console.log(chalk.bold('  Contacts'))
        if (result.sharedNumber) {
            console.log(chalk.dim(`  Shared number: ${formatPhoneNumber(result.sharedNumber)}`))
        }
        console.log()

        if (result.contacts.length === 0) {
            console.log(chalk.dim('  No contacts yet. Add one with:'))
            console.log(chalk.cyan('    sendblue add-contact +15551234567'))
            console.log()
            return
        }

        for (const contact of result.contacts) {
            const status = contact.verified
                ? chalk.green('verified')
                : chalk.yellow('awaiting text')
            console.log(`  ${formatPhoneNumber(contact.number)}  ${status}`)
        }

        const pending = result.contacts.filter((c: { verified: boolean }) => !c.verified)
        if (pending.length > 0 && result.sharedNumber) {
            console.log()
            console.log(chalk.dim(`  Pending contacts need to text ${formatPhoneNumber(result.sharedNumber)} to verify.`))
        }
        console.log()

    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
