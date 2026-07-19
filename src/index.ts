#!/usr/bin/env node

import { createRequire } from 'node:module'
import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { loginCommand } from './commands/login.js'
import { sendCommand } from './commands/send.js'
import { sendGroupCommand } from './commands/send-group.js'
import { messagesCommand } from './commands/messages.js'
import { statusCommand } from './commands/status.js'
import { whoamiCommand } from './commands/whoami.js'
import { addContactCommand, contactsCommand } from './commands/add-contact.js'
import { typingCommand } from './commands/typing.js'
import { linesCommand } from './commands/lines.js'
import { webhooksListCommand, webhooksAddCommand, webhooksRemoveCommand } from './commands/webhooks.js'
import { showKeysCommand } from './commands/show-keys.js'
import { totpAddCommand, totpListCommand, totpCodeCommand, totpRemoveCommand } from './commands/totp.js'
import { getLogo } from './lib/format.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const program = new Command()

program
    .name('sendblue')
    .description(getLogo())
    .version(version)

program
    .command('setup')
    .description('Create a new Sendblue account and get an iMessage number (verify by email or by text)')
    .option('--phone <number>', 'Sign up with your phone number — verify by sending one text, no email needed')
    .option('--email <email>', 'Email address (skip prompt)')
    .option('--code <code>', 'Verification code (skip prompt, requires --email)')
    .option('--company <name>', 'Company name (skip prompt)')
    .option('--contact <number>', 'First contact phone number (skip prompt)')
    .option('--no-wait', 'With --phone: print the verification text and exit instead of waiting')
    .option('--check [sessionId]', 'Finish a pending phone signup (exit code 3 while still waiting)')
    .action(setupCommand)

program
    .command('login')
    .description('Log in to an existing Sendblue account (email by default, --phone to verify by text)')
    .option('--phone <number>', 'Log in by verifying your phone number with one text')
    .option('--account <name>', 'Account name, if this phone belongs to multiple accounts')
    .option('--no-wait', 'With --phone: print the verification text and exit instead of waiting')
    .option('--check [sessionId]', 'Finish a pending phone login (exit code 3 while still waiting)')
    .action(loginCommand)

program
    .command('send')
    .description('Send a message')
    .argument('<number>', 'Recipient phone number (E.164 format)')
    .argument('<message>', 'Message content')
    .option('--media <path>', 'Attach an image, video, or file (local path or URL)')
    .action(sendCommand)

program
    .command('send-group')
    .description('Send a group message')
    .argument('<args...>', 'Phone numbers followed by message: <num1> <num2> [...] <message>')
    .option('--media <path>', 'Attach an image, video, or file (local path or URL)')
    .action(sendGroupCommand)

program
    .command('typing')
    .description('Send a typing indicator')
    .argument('<number>', 'Recipient phone number (E.164 format)')
    .action(typingCommand)

program
    .command('messages')
    .description('View recent messages')
    .option('-n, --number <number>', 'Filter by contact phone number')
    .option('-l, --limit <count>', 'Number of messages to show', '10')
    .option('--outbound', 'Show only outbound messages')
    .option('--inbound', 'Show only inbound messages')
    .action(messagesCommand)

program
    .command('add-contact')
    .description('Add a contact to your account')
    .argument('<number>', 'Contact phone number (E.164 format)')
    .action(addContactCommand)

program
    .command('contacts')
    .description('List contacts and verification status')
    .action(contactsCommand)

program
    .command('lines')
    .description('List phone numbers on your account')
    .action(linesCommand)

const webhooks = program
    .command('webhooks')
    .description('Manage webhooks')

webhooks
    .command('list')
    .description('List configured webhooks')
    .action(webhooksListCommand)

webhooks
    .command('add')
    .description('Add a webhook')
    .argument('<url>', 'Webhook URL')
    .requiredOption('--type <type>', 'Event type (receive, outbound, call_log, line_blocked, line_assigned, contact_created)')
    .action(webhooksAddCommand)

webhooks
    .command('remove')
    .description('Remove a webhook')
    .argument('<url>', 'Webhook URL')
    .requiredOption('--type <type>', 'Event type')
    .action(webhooksRemoveCommand)

const totp = program
    .command('totp')
    .description('Manage TOTP (2FA) secrets')

totp
    .command('add')
    .description('Store a new TOTP secret')
    .option('--label <label>', 'Label for this secret (e.g. "GitHub")')
    .option('--uri <uri>', 'otpauth:// URI from a QR code')
    .option('--secret <secret>', 'Base32 TOTP secret (if no URI)')
    .option('--issuer <issuer>', 'Issuer name (e.g. "GitHub")')
    .action(totpAddCommand)

totp
    .command('list')
    .description('List stored TOTP secrets')
    .action(totpListCommand)

totp
    .command('code <secret-id>')
    .description('Get the current TOTP code for a secret')
    .action(totpCodeCommand)

totp
    .command('remove <secret-id>')
    .description('Delete a stored TOTP secret')
    .action(totpRemoveCommand)

program
    .command('status')
    .description('Check your account status')
    .action(statusCommand)

program
    .command('whoami')
    .description('Show current credentials')
    .action(whoamiCommand)

program
    .command('show-keys')
    .description('Show your API key and secret')
    .action(showKeysCommand)

program.addHelpText('after', `
Sign up / log in with just a phone number:
  sendblue setup --phone <your-number> --company <name>   New account: you text a one-time
                                                          phrase to the number shown — that
                                                          single text IS the signup.
  sendblue login --phone <your-number>                    Existing account, same trick.

For AI agents:
  Machine-readable docs: https://docs.sendblue.com/llms.txt
  Non-interactive flows: add --no-wait, relay the phrase to the user, then poll
  \`sendblue login --check\` / \`sendblue setup --check\` (exit code 3 = still waiting).
  After phone signup the user's own phone is already a verified contact:
  sendblue send <user-number> 'hello' works immediately.
`)

program.parse()
