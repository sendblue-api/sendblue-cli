import chalk from 'chalk'
import { getCredentials } from '../lib/config.js'
import { printError } from '../lib/format.js'

export async function showKeysCommand(): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    console.log()
    console.log(chalk.bold('  API Keys'))
    console.log()
    console.log(`  ${chalk.bold('API Key')}:    ${creds.apiKey}`)
    console.log(`  ${chalk.bold('API Secret')}: ${creds.apiSecret}`)
    console.log()
}
