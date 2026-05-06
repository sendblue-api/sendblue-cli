import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { getAccount } from '../lib/api.js'
import { formatPhoneNumber, printError } from '../lib/format.js'
import { refreshCredentialsFromProvisioning } from '../lib/refresh.js'

export async function statusCommand(): Promise<void> {
    let creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue login` first.')
        process.exit(1)
    }

    const spinner = ora({ text: 'Fetching account status...', indent: 2 }).start()

    try {
        const refresh = await refreshCredentialsFromProvisioning(creds)
        creds = refresh.credentials
        const account = await getAccount(creds.apiKey, creds.apiSecret)
        spinner.stop()

        console.log()
        console.log(chalk.bold('  Account Status'))
        console.log()
        console.log(`  ${chalk.bold('Email')}:         ${creds.email}`)
        if (creds.companyName) {
            console.log(`  ${chalk.bold('Company')}:       ${creds.companyName}`)
        }
        console.log(`  ${chalk.bold('Phone Number')}:  ${formatPhoneNumber(creds.assignedNumber)}`)
        console.log(`  ${chalk.bold('Plan')}:          ${account.plan || creds.plan}`)
        if (refresh.refreshed) {
            console.log(chalk.dim('  Local credentials refreshed from provisioning status.'))
        }
        console.log()
    } catch (err) {
        spinner.fail(`Failed to fetch status: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
