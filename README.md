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

# Or create an agent sandbox without API keys or a phone number up front:
sendblue sandbox init
# The CLI shows a one-time phrase (e.g. "SB SETUP 123456") and your Sendblue number.
# Text that phrase from the phone you want to verify — that single text creates the account.
# The sender phone becomes the account identity and unlocks sandbox credits.

sendblue sandbox connect
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
| `--phone <number>` | Sign up with just your phone number — verify by one text, no email or account name needed |
| `--email <email>` | Email address |
| `--code <code>` | 8-digit verification code |
| `--company <name>` | Account name — **optional**, defaults to your phone number (lowercase, hyphens/underscores, 3-64 chars) |
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

Machine-readable docs live at [docs.sendblue.com/llms.txt](https://docs.sendblue.com/llms.txt). For sandboxes, do not ask the user for API keys or a phone number up front. Start the challenge, relay the Sendblue number and setup phrase, and let the inbound text bind the sender phone.

```bash
# 1. Start sandbox signup and create the first sandbox:
npx -y @sendblue/cli sandbox init

# 2. Relay the printed one-time phrase + Sendblue number to the user:
#    "Text 'SB SETUP 123456' from the phone you want to verify to +1 (786) 213-9363."
#    That single text proves the sender phone, creates the account, and saves keys.

# 3. Hand the agent its sandbox instructions:
npx -y @sendblue/cli sandbox connect
```

If your agent needs to exit while waiting for the text, keep a stable `HOME` and poll:

```bash
export SENDBLUE_HOME="${SENDBLUE_HOME:-${TMPDIR:-/tmp}/sendblue-sandbox-init}"
mkdir -p "$SENDBLUE_HOME"
export HOME="$SENDBLUE_HOME"

npx -y @sendblue/cli sandbox init --no-wait

until npx -y @sendblue/cli setup --check; do
  code=$?
  if [ "$code" -eq 3 ]; then sleep 5; else exit "$code"; fi
done

npx -y @sendblue/cli sandbox create
```

Prefer the CLI over ad-hoc credential hunting: `sendblue whoami` tells you whether working credentials already exist on the machine before you go looking for API keys.

## Links

- [Sendblue](https://sendblue.com)
- [API Docs](https://docs.sendblue.com)
