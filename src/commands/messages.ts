import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { getMessages } from '../lib/api.js'
import { formatPhoneNumber, normalizeNumber, printError } from '../lib/format.js'

export async function messagesCommand(opts: {
    number?: string
    limit?: string
    outbound?: boolean
    inbound?: boolean
}): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` to create an account, or `sendblue login` if you already have one.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Fetching messages...', indent: 2 }).start()

    try {
        const isOutbound = opts.outbound ? true : opts.inbound ? false : undefined
        const number = opts.number ? normalizeNumber(opts.number) : undefined
        const limit = Math.min(parseInt(opts.limit || '10', 10) || 10, 100)

        const result = await getMessages(creds.apiKey, creds.apiSecret, {
            number,
            limit,
            isOutbound
        })

        spinner.stop()
        console.log()

        if (result.data.length === 0) {
            console.log(chalk.dim('  No messages found.'))
            console.log()
            return
        }

        console.log(chalk.bold(`  Messages`) + chalk.dim(` (${result.data.length} of ${result.pagination.total})`))
        console.log()

        for (const msg of result.data) {
            const direction = msg.is_outbound
                ? chalk.cyan('OUT')
                : chalk.green(' IN')

            const otherNumber = msg.is_outbound ? msg.to_number : msg.from_number
            const formatted = otherNumber && typeof otherNumber === 'string' ? formatPhoneNumber(otherNumber) : '?'

            const date = new Date(msg.date_sent)
            const timestamp = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            })

            const status = msg.status === 'SENT' || msg.status === 'DELIVERED'
                ? ''
                : ` ${chalk.yellow(`[${msg.status}]`)}`

            const content = msg.content
                ? msg.content.length > 80
                    ? msg.content.slice(0, 77) + '...'
                    : msg.content
                : chalk.dim('(media)')

            console.log(`  ${direction} ${chalk.dim(timestamp)}  ${chalk.bold(formatted)}${status}`)
            console.log(`     ${content}`)
            console.log()
        }

        if (result.pagination.hasMore) {
            console.log(chalk.dim(`  Showing ${result.data.length} of ${result.pagination.total}. Use --limit to see more.`))
            console.log()
        }
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
