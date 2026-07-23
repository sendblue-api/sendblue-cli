import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import { totpAddSecret, totpListSecrets, totpGetCode, totpDeleteSecret } from '../lib/api.js'
import { printError } from '../lib/format.js'

function requireCreds() {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` to create an account, or `sendblue login` if you already have one.')
        process.exit(1)
    }
    return creds
}

export async function totpAddCommand(opts: { label?: string; uri?: string; secret?: string; issuer?: string }): Promise<void> {
    const creds = requireCreds()

    if (!opts.label && !opts.uri) {
        printError('Provide --label or --uri (otpauth:// URI from a QR code).')
        process.exit(1)
    }

    const spinner = ora({ text: 'Storing TOTP secret...', indent: 2 }).start()

    try {
        const result = await totpAddSecret(creds.apiKey, creds.apiSecret, opts)
        spinner.succeed('TOTP secret stored!')
        console.log()
        console.log(`  ${chalk.bold('ID')}       ${chalk.cyan(result.id)}`)
        console.log(`  ${chalk.bold('Label')}    ${result.label}`)
        if (result.issuer) console.log(`  ${chalk.bold('Issuer')}   ${result.issuer}`)
        console.log(`  ${chalk.bold('Secret')}   ${chalk.dim(result.secret)}`)
        console.log()
        console.log(chalk.yellow('  Save this secret now — it cannot be recovered once you leave this screen.'))
        console.log()
        console.log(chalk.dim('  Get a code anytime:'))
        console.log(chalk.cyan(`    sendblue totp code ${result.id}`))
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export async function totpListCommand(): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: 'Fetching TOTP secrets...', indent: 2 }).start()

    try {
        const secrets = await totpListSecrets(creds.apiKey, creds.apiSecret)
        spinner.stop()
        console.log()
        console.log(chalk.bold('  TOTP Secrets'))
        console.log()

        if (secrets.length === 0) {
            console.log(chalk.dim('  No TOTP secrets stored. Add one with:'))
            console.log(chalk.cyan('    sendblue totp add --uri "otpauth://..."'))
            console.log()
            return
        }

        for (const s of secrets) {
            console.log(`  ${chalk.cyan(s.id)}`)
            console.log(`    ${chalk.bold(s.label)}${s.issuer ? chalk.dim(` (${s.issuer})`) : ''}`)
            console.log(`    ${chalk.dim(`${s.digits} digits · ${s.period}s · ${s.algorithm}`)}`)
            console.log()
        }

        console.log(chalk.dim('  Get a code: sendblue totp code <id>'))
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export async function totpCodeCommand(secretId: string): Promise<void> {
    const creds = requireCreds()

    try {
        const result = await totpGetCode(creds.apiKey, creds.apiSecret, secretId)
        process.stdout.write(result.code + '\n')
    } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
    }
}

export async function totpRemoveCommand(secretId: string): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: 'Deleting TOTP secret...', indent: 2 }).start()

    try {
        await totpDeleteSecret(creds.apiKey, creds.apiSecret, secretId)
        spinner.succeed('TOTP secret deleted.')
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}
