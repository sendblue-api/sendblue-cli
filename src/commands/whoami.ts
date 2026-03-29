import chalk from 'chalk'
import ora from 'ora'
import { getCredentials, credentialsPath } from '../lib/config.js'
import { testKeys } from '../lib/api.js'
import { formatPhoneNumber, printError } from '../lib/format.js'

export async function whoamiCommand(): Promise<void> {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Validating keys...', indent: 2 }).start()

    let valid = false
    try {
        valid = await testKeys(creds.apiKey, creds.apiSecret)
    } catch {
        // Network error — keys may still be valid
    }

    spinner.stop()

    console.log()
    console.log(chalk.bold('  Current Account'))
    console.log()
    console.log(`  ${chalk.bold('Email')}:         ${creds.email}`)
    console.log(`  ${chalk.bold('Phone Number')}:  ${formatPhoneNumber(creds.assignedNumber)}`)
    console.log(`  ${chalk.bold('API Key')}:       ${creds.apiKey.slice(0, 8)}...`)
    console.log(`  ${chalk.bold('Plan')}:          ${creds.plan}`)
    console.log(`  ${chalk.bold('Keys Valid')}:    ${valid ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`  ${chalk.bold('Config')}:        ${credentialsPath()}`)
    console.log()
}
