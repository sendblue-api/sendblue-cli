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
    .description('Create a new Sendblue account and get an iMessage number')
    .option('--email <email>', 'Email address (skip prompt)')
    .option('--code <code>', 'Verification code (skip prompt, requires --email)')
    .option('--company <name>', 'Company name (skip prompt)')
    .option('--contact <number>', 'First contact phone number (skip prompt)')
    .action(setupCommand)

program
    .command('login')
    .description('Log in to an existing Sendblue account')
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

program.parse()
