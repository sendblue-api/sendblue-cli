# Sendblue CLI

iMessage numbers for AI agents. Set up an iMessage-enabled phone number and start sending messages in under a minute.

Free-plan note for agents: contacts added to a free API account must verify by texting your Sendblue number once before agents can send messages to them.

## Install

```bash
npm install -g @sendblue/cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Create an account and get an iMessage number
sendblue setup

# Send a message
sendblue send +15551234567 'Hello from Sendblue!'
```

## Commands

### `sendblue setup`

Create a new Sendblue account. Walks you through email verification, company name, and adding your first contact.

```bash
# Interactive (recommended for first time)
sendblue setup

# Non-interactive (for CI/scripts)
sendblue setup --email you@example.com                          # sends verification code, exits
sendblue setup --email you@example.com --code 12345678 --company my-co --contact +15551234567
```

| Flag | Description |
|------|-------------|
| `--email <email>` | Email address |
| `--code <code>` | 8-digit verification code |
| `--company <name>` | Company name (lowercase, hyphens/underscores, 3-64 chars) |
| `--contact <number>` | First contact phone number (E.164 format) |

### `sendblue login`

Log in to an existing account.

```bash
sendblue login
```

### `sendblue send <number> <message>`

Send an iMessage.

```bash
sendblue send +15551234567 'Hey, your order shipped!'
```

### `sendblue messages`

View recent messages.

```bash
sendblue messages
sendblue messages -n +15551234567 --limit 20
sendblue messages --inbound
```

| Flag | Description |
|------|-------------|
| `-n, --number <number>` | Filter by contact |
| `-l, --limit <count>` | Number of messages (default: 10) |
| `--outbound` | Show only sent messages |
| `--inbound` | Show only received messages |

### `sendblue add-contact <number>`

Add a contact to your account.

```bash
sendblue add-contact +15551234567
```

On the free plan, the contact must text your Sendblue/shared number once to verify before you or any agent can message them.

### `sendblue contacts`

List all contacts and their verification status.

### `sendblue status`

Check your account status and plan.

### `sendblue upgrade`

Upgrade a free API account to the AI agent plan. Opens Stripe Checkout, where customers can pay with Link when Link is enabled for Sendblue in Stripe.

```bash
sendblue upgrade
sendblue upgrade --poll      # wait for dedicated number provisioning
sendblue upgrade --no-open   # print checkout URL only
```

### `sendblue whoami`

Show current credentials and verify they're valid.

## Credentials

Credentials are stored in `~/.sendblue/credentials.json` with `600` permissions (owner read/write only). Run `sendblue whoami` to see the current config path.

## Links

- [Sendblue](https://sendblue.co)
- [API Docs](https://docs.sendblue.co)
