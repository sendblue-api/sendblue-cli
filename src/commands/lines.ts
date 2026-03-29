import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { getLines } from '../lib/api.js'
import { formatPhoneNumber, printError } from '../lib/format.js'

export async function linesCommand(): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Fetching lines...', indent: 2 }).start()

    try {
        const result = await getLines(creds.apiKey, creds.apiSecret)
        spinner.stop()

        console.log()
        console.log(chalk.bold('  Phone Lines'))
        console.log()

        if (!result.numbers || result.numbers.length === 0) {
            console.log(chalk.dim('  No lines assigned yet.'))
        } else {
            for (const number of result.numbers) {
                console.log(`  ${formatPhoneNumber(number)}`)
            }
            console.log()
            console.log(chalk.dim(`  ${result.numbers.length} line${result.numbers.length === 1 ? '' : 's'} total`))
        }
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
