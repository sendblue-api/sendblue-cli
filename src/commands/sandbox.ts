import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getCredentials } from '../lib/config.js'
import {
    createSandbox,
    listSandboxes,
    execSandbox,
    readSandboxFile,
    writeSandboxFile,
    deleteSandbox
} from '../lib/api.js'
import { printError } from '../lib/format.js'

function requireCreds() {
    const creds = getCredentials()
    if (!creds) {
        printError('No credentials found. Run `sendblue setup` to create an account, or `sendblue login` if you already have one.')
        process.exit(1)
    }
    return creds
}

function usd(n: number): string {
    return (Number(n) || 0).toFixed(2)
}

function formatCreated(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    })
}

// Ensure text ends with exactly one trailing newline before writing raw output.
function writeStream(stream: NodeJS.WriteStream, text: string): void {
    if (!text) return
    stream.write(text.endsWith('\n') ? text : text + '\n')
}

async function createAction(): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: 'Creating sandbox...', indent: 2 }).start()

    try {
        const sandbox = await createSandbox(creds.apiKey, creds.apiSecret)
        spinner.succeed('Sandbox created!')
        console.log()
        console.log(`  ${chalk.bold('ID')}      ${chalk.cyan(sandbox.id)}`)
        console.log(`  ${chalk.bold('Status')}  ${sandbox.status}`)
        console.log()
        console.log(chalk.dim('  Run a command:'))
        console.log(chalk.cyan(`    sendblue sandbox exec ${sandbox.id} "echo hello"`))
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function listAction(): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: 'Fetching sandboxes...', indent: 2 }).start()

    try {
        const result = await listSandboxes(creds.apiKey, creds.apiSecret)
        spinner.stop()

        console.log()
        console.log(chalk.bold('  Sandboxes'))
        console.log()

        if (!result.sandboxes || result.sandboxes.length === 0) {
            console.log(chalk.dim('  No active sandboxes. Create one with:'))
            console.log(chalk.cyan('    sendblue sandbox create'))
            console.log()
        } else {
            for (const sbx of result.sandboxes) {
                const created = sbx.created_at ? chalk.dim(`  ${formatCreated(sbx.created_at)}`) : ''
                console.log(`  ${chalk.cyan(sbx.id)}  ${sbx.status}${created}`)
            }
            console.log()
        }

        const u = result.usage
        if (u) {
            console.log(chalk.bold('  Usage'))
            console.log()
            console.log(`  ${chalk.bold('Spent')}       $${usd(u.used_usd)} of $${usd(u.cap_usd)}`)
            console.log(`  ${chalk.bold('Remaining')}   $${usd(u.remaining_usd)}`)
            console.log(`  ${chalk.bold('Rate')}        $${usd(u.rate_usd_per_hour)}/hr`)
            console.log(`  ${chalk.bold('Max active')}  ${u.max_active_sandboxes}`)
            console.log()
        }
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function execAction(id: string, commandParts: string[], opts: { timeout?: string }): Promise<void> {
    const creds = requireCreds()
    const command = commandParts.join(' ')
    const timeoutMs = opts.timeout !== undefined ? parseInt(opts.timeout, 10) : undefined

    if (timeoutMs !== undefined && (isNaN(timeoutMs) || timeoutMs <= 0)) {
        printError('--timeout must be a positive number of milliseconds.')
        process.exit(1)
    }

    const spinner = ora({ text: `Running in ${id}...`, indent: 2 }).start()

    try {
        const result = await execSandbox(creds.apiKey, creds.apiSecret, id, command, timeoutMs)
        spinner.stop()

        writeStream(process.stdout, result.stdout)
        writeStream(process.stderr, result.stderr)

        if (!result.stdout && !result.stderr) {
            console.log(chalk.dim('  (no output)'))
        }

        if (result.exit_code !== 0) {
            console.error(chalk.dim(`  exit code ${result.exit_code}`))
            process.exit(result.exit_code || 1)
        }
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function readAction(id: string, path: string): Promise<void> {
    const creds = requireCreds()

    try {
        const content = await readSandboxFile(creds.apiKey, creds.apiSecret, id, path)
        writeStream(process.stdout, content)
    } catch (err) {
        printError(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function writeAction(id: string, path: string, content: string): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: `Writing ${path}...`, indent: 2 }).start()

    try {
        await writeSandboxFile(creds.apiKey, creds.apiSecret, id, path, content)
        spinner.succeed(`Wrote ${path}`)
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function deleteAction(id: string): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: `Deleting ${id}...`, indent: 2 }).start()

    try {
        await deleteSandbox(creds.apiKey, creds.apiSecret, id)
        spinner.succeed(`Sandbox ${id} deleted.`)
        console.log()
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

async function connectAction(): Promise<void> {
    const creds = requireCreds()
    const spinner = ora({ text: 'Fetching connect prompt...', indent: 2 }).start()

    try {
        const result = await listSandboxes(creds.apiKey, creds.apiSecret)
        spinner.stop()

        const prompt = result.connect?.prompt
        if (!prompt) {
            printError('No connect prompt available for your account.')
            process.exit(1)
        }

        writeStream(process.stdout, prompt)
    } catch (err) {
        spinner.fail(`Failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
    }
}

export const sandboxCommand = new Command('sandbox')
    .description('Spin up and drive cloud sandboxes for agents')

sandboxCommand
    .command('create')
    .description('Create a new sandbox')
    .action(createAction)

sandboxCommand
    .command('list')
    .alias('ls')
    .description('List active sandboxes and account usage')
    .action(listAction)

sandboxCommand
    .command('exec <id> <command...>')
    .description('Run a shell command inside a sandbox')
    .option('--timeout <ms>', 'Command timeout in milliseconds')
    .allowUnknownOption() // so flags in the command (e.g. `ls -la`) pass through
    .action(execAction)

sandboxCommand
    .command('read <id> <path>')
    .description('Read a file from a sandbox (prints its contents)')
    .action(readAction)

sandboxCommand
    .command('write <id> <path> <content>')
    .description('Write a file inside a sandbox')
    .action(writeAction)

sandboxCommand
    .command('delete <id>')
    .alias('rm')
    .description('Destroy a sandbox')
    .action(deleteAction)

sandboxCommand
    .command('connect')
    .description('Print the connect prompt to paste into an agent')
    .action(connectAction)

sandboxCommand.addHelpText('after', `
Examples:
  sendblue sandbox create
  sendblue sandbox exec sbx_123 "npm install"
  sendblue sandbox exec sbx_123 ls -la
  sendblue sandbox write sbx_123 /app/hello.txt "hi there"
  sendblue sandbox read sbx_123 /app/hello.txt
  sendblue sandbox list
  sendblue sandbox connect
  sendblue sandbox delete sbx_123
`)
