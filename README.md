# Sendblue CLI

iMessage numbers for AI agents. Set up an iMessage-enabled phone number and start sending messages in under a minute.

## Install

```bash
npm install -g @sendblue/cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Create an account and get an iMessage number (interactive, email verification)
sendblue setup

# Or sign up with just your phone number — no email needed:
sendblue setup --phone +15551234567 --company my-agent
# The CLI shows a one-time phrase (e.g. "SB SETUP 123456") and your Sendblue number.
# Text that phrase from your phone to that number — that single text IS the signup.
# Your phone is then already a verified contact, so this works immediately:

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

```bash
# Phone verification (no email at all)
sendblue setup --phone +15551234567 --company my-co
# → text the shown one-time phrase (e.g. "SB SETUP 123456") from your phone
#   to the shown Sendblue number; the CLI waits and finishes on its own
```

| Flag | Description |
|------|-------------|
| `--phone <number>` | Sign up with your phone number — verify by sending one text, no email needed |
| `--email <email>` | Email address |
| `--code <code>` | 8-digit verification code |
| `--company <name>` | Company name (lowercase, hyphens/underscores, 3-64 chars) |
| `--account <name>` | Alias for `--company` |
| `--contact <number>` | First contact phone number (E.164 format) |
| `--no-wait` | With `--phone`: print the verification text and exit instead of waiting |
| `--check [sessionId]` | Finish a pending phone signup — resumes the saved session, or pass a session id explicitly (exit code 3 while still waiting) |

With `--phone`, the phone you verify becomes the account's login identity **and** its first verified contact — `sendblue send <your-number> '...'` works the moment setup completes.

### `sendblue login`

Log in to an existing account. Email verification by default; `--phone` logs in by texting a one-time phrase instead.

```bash
sendblue login                          # email + 8-digit code (default)
sendblue login --phone +15551234567     # text one phrase from your phone, done
sendblue login --phone +15551234567 --account my-co   # if the phone is on multiple accounts
```

| Flag | Description |
|------|-------------|
| `--phone <number>` | Log in by verifying your phone number with one text |
| `--account <name>` | Account name, if this phone belongs to multiple accounts |
| `--company <name>` | Alias for `--account` |
| `--no-wait` | With `--phone`: print the verification text and exit instead of waiting |
| `--check [sessionId]` | Finish a pending phone login — resumes the saved session, or pass a session id explicitly (exit code 3 while still waiting) |

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

### `sendblue contacts`

List all contacts and their verification status.

### `sendblue status`

Check your account status and plan.

### `sendblue whoami`

Show current credentials and verify they're valid.

## Credentials

Credentials are stored in `~/.sendblue/credentials.json` with `600` permissions (owner read/write only). Run `sendblue whoami` to see the current config path.

## For AI agents

Machine-readable docs live at [docs.sendblue.com/llms.txt](https://docs.sendblue.com/llms.txt). The recommended non-interactive flow for agent-assisted setup:

```bash
# 1. Start signup (or `login --phone` for an existing account) without blocking:
npx -y @sendblue/cli setup --phone <user-number> --company <account-name> --no-wait

# 2. Relay the printed one-time phrase + Sendblue number to the user:
#    "Text 'SB SETUP 123456' from your phone to +1 (786) 213-9363 to finish signup."
#    That single text proves ownership of the number and completes signup —
#    there is no email step and nothing else to do.

# 3. Poll until the user has texted (exit code 3 = still waiting, 0 = done):
npx -y @sendblue/cli setup --check

# 4. The user's phone is already a verified contact — send immediately:
npx -y @sendblue/cli send <user-number> 'Set up complete!'
```

Prefer the CLI over ad-hoc credential hunting: `sendblue whoami` tells you whether working credentials already exist on the machine before you go looking for API keys.

## Links

- [Sendblue](https://sendblue.com)
- [API Docs](https://docs.sendblue.com)
