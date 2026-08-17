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

# Or create an agent sandbox. Interactive setup prompts for the phone:
sendblue sandbox init
# The CLI shows a one-time Verify code and Sendblue number.
# Text that code from the phone you entered — that single text creates the account.
# The verified phone becomes the account identity and unlocks sandbox credits.

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

### `sendblue events`

Stream live account activity through the official `sendblue` SDK's authenticated SSE resource. The CLI reconnects automatically, stores a per-credential cursor under `~/.sendblue/`, deduplicates event IDs, and repairs disconnect gaps from the message/contact/verification recovery queries and line-state snapshot. Recovery deliberately overlaps the saved cursor by one minute to tolerate timestamp ties and read-replica lag.

```bash
sendblue events
sendblue events --types message.received,message.updated
sendblue events --since 2026-08-16T00:00:00Z
sendblue events --jsonl                  # integrations and desktop plugins
sendblue events --jsonl --include-control
sendblue events --once                   # recovery snapshots, then exit
```

Typing indicators are ephemeral and cannot be recovered after a disconnect. `--include-control` adds `stream.connected`, `stream.disconnected`, `recovery.warning`, and authoritative `lines.snapshot` JSONL records; they are CLI integration records, not Sendblue account event types. A line snapshot is a complete replacement, including an empty array, so integrations can remove stale lines after reconnecting. Recovery warnings are also written to stderr, allowing JSONL consumers to remain machine-readable while surfacing partial recovery failures.

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

Credentials are stored in `~/.sendblue/credentials.json` with `600` permissions (owner read/write only). Set `SENDBLUE_CONFIG_DIR` to isolate credentials and pending verification state for tests or concurrent environments. Run `sendblue whoami` to see the current config path.

## For AI agents

Machine-readable docs live at [docs.sendblue.com/llms.txt](https://docs.sendblue.com/llms.txt). For sandboxes, API keys are created only after the submitted phone completes Sendblue Verify. Interactive setup prompts for the phone; non-interactive agents must pass `--phone`.

```bash
# 1. Start sandbox signup and create the first sandbox:
npx -y @sendblue/cli@latest sandbox init --phone +15551234567

# 2. Relay the printed one-time code + Sendblue number to the user.
#    That text proves the submitted phone, creates the account, and saves keys.

# 3. Hand the agent its sandbox instructions:
npx -y @sendblue/cli@latest sandbox connect
```

If your agent needs to exit while waiting for the text, keep a stable config directory and poll:

```bash
export SENDBLUE_CONFIG_DIR="${SENDBLUE_CONFIG_DIR:-${TMPDIR:-/tmp}/sendblue-sandbox-init}"

npx -y @sendblue/cli@latest sandbox init --phone +15551234567 --no-wait

until npx -y @sendblue/cli@latest setup --check; do
  code=$?
  if [ "$code" -eq 3 ]; then sleep 5; else exit "$code"; fi
done

npx -y @sendblue/cli@latest sandbox create
```

Prefer the CLI over ad-hoc credential hunting: `sendblue whoami` tells you whether working credentials already exist on the machine before you go looking for API keys.

## Links

- [Sendblue](https://sendblue.com)
- [API Docs](https://docs.sendblue.com)
