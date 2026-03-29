import chalk from 'chalk'

const blue = chalk.hex('#0088FF')

/*
export function printLogo(): void {
    // Chat bubble with small satellite circle, matching Sendblue logo
    const b = blue('█')
    const h = blue('▀')
    const l = blue('▄')
    const logo = [
        `                  ${l}${l}`,
        `                ${l}${l}${l}${l}${l}${l}${l}  ${l}${l}${l}`,
        `          ${l}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${h}${h}${h}`,
        `        ${l}${l}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `        ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `       ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `        ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${h}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${h}`,
        `            ${h}${h}${h} ${h}${h}${h}${h}${h}${h}${h} ${h}${h}`,
        `                 ${h}${h}${h}${h}${h}`,
    ]
    for (const line of logo) {
        console.log(`  ${line}`)
    }
    console.log()
    console.log(blue.bold('                 sendblue'))
    console.log(chalk.dim('            iMessage for agents'))
    console.log()
}
*/

export function printLogo(): void {
    const lines = [
        '███████╗███████╗███╗   ██╗██████╗',
        '██╔════╝██╔════╝████╗  ██║██╔══██╗',
        '███████╗█████╗  ██╔██╗ ██║██║  ██║',
        '╚════██║██╔══╝  ██║╚██╗██║██║  ██║',
        '███████║███████╗██║ ╚████║██████╔╝',
        '╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝',
        '',
        '██████╗ ██╗     ██╗   ██╗███████╗',
        '██╔══██╗██║     ██║   ██║██╔════╝',
        '██████╔╝██║     ██║   ██║█████╗',
        '██╔══██╗██║     ██║   ██║██╔══╝',
        '██████╔╝███████╗╚██████╔╝███████╗',
        '╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝',
    ]
    for (const line of lines) {
        console.log(blue(line))
    }
    console.log()
    console.log(chalk.dim('       iMessage for agents'))
    console.log()
}

/*
export function getLogo(): string {
    const b = blue('█')
    const h = blue('▀')
    const l = blue('▄')
    const lines = [
        `                  ${l}${l}`,
        `                ${l}${l}${l}${l}${l}${l}${l}  ${l}${l}${l}`,
        `          ${l}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b} ${h}${h}${h}`,
        `        ${l}${l}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `        ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `       ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `        ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}`,
        `          ${h}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${b}${h}`,
        `            ${h}${h}${h} ${h}${h}${h}${h}${h}${h}${h} ${h}${h}`,
        `                 ${h}${h}${h}${h}${h}`,
        ``,
        blue.bold('                 Sendblue'),
        chalk.dim('            iMessage for agents'),
    ]
    return '\n' + lines.map(l => `  ${l}`).join('\n') + '\n'
}
*/

export function getLogo(): string {
    const lines = [
        '███████╗███████╗███╗   ██╗██████╗',
        '██╔════╝██╔════╝████╗  ██║██╔══██╗',
        '███████╗█████╗  ██╔██╗ ██║██║  ██║',
        '╚════██║██╔══╝  ██║╚██╗██║██║  ██║',
        '███████║███████╗██║ ╚████║██████╔╝',
        '╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝',
        '',
        '██████╗ ██╗     ██╗   ██╗███████╗',
        '██╔══██╗██║     ██║   ██║██╔════╝',
        '██████╔╝██║     ██║   ██║█████╗',
        '██╔══██╗██║     ██║   ██║██╔══╝',
        '██████╔╝███████╗╚██████╔╝███████╗',
        '╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝',
        '',
        chalk.dim('       iMessage for agents'),
    ]
    return '\n' + lines.map(l => blue(l)).join('\n') + '\n'
}

export function normalizeNumber(input: string): string {
    // Strip non-digit chars except leading +
    let num = input.replace(/[^\d+]/g, '')
    // 10-digit US number: prepend +1
    if (/^\d{10}$/.test(num)) {
        num = `+1${num}`
    }
    // 11-digit starting with 1: prepend +
    else if (/^1\d{10}$/.test(num)) {
        num = `+${num}`
    }
    // Already has +: keep as-is
    else if (!num.startsWith('+')) {
        num = `+${num}`
    }
    return num
}

export function formatPhoneNumber(e164: string): string {
    // +15551234567 -> +1 (555) 123-4567
    const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
    if (match) {
        return `+1 (${match[1]}) ${match[2]}-${match[3]}`
    }
    return e164
}

export function printSuccess(message: string): void {
    console.log(chalk.green(message))
}

export function printError(message: string): void {
    console.error(chalk.red(message))
}

export function printInfo(message: string): void {
    console.log(chalk.cyan(message))
}

export function printCredentials(data: {
    email: string
    apiKey: string
    apiSecret: string
    assignedNumber: string
    plan: string
}): void {
    console.log()
    console.log(chalk.green.bold('  Account created successfully!'))
    console.log()
    console.log(`  ${chalk.bold('Phone Number')}:  ${formatPhoneNumber(data.assignedNumber)}`)
    console.log(`  ${chalk.bold('API Key')}:       ${data.apiKey}`)
    console.log(`  ${chalk.bold('API Secret')}:    ${'*'.repeat(data.apiSecret.length - 4)}${data.apiSecret.slice(-4)}`)
    console.log(`  ${chalk.bold('Plan')}:          ${data.plan}`)
    console.log()
}
