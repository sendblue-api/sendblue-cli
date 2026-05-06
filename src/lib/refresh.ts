import { getProvisioningStatus } from './api.js'
import { saveCredentials, type SendblueCredentials } from './config.js'

export interface RefreshResult {
    credentials: SendblueCredentials
    refreshed: boolean
}

export async function refreshCredentialsFromProvisioning(
    creds: SendblueCredentials
): Promise<RefreshResult> {
    if (!creds.companyName || creds.plan !== 'free_api') {
        return { credentials: creds, refreshed: false }
    }

    let status
    try {
        status = await getProvisioningStatus(creds.companyName, creds.apiKey, creds.apiSecret)
    } catch {
        return { credentials: creds, refreshed: false }
    }

    if (status.status !== 'complete' || !status.newNumber) {
        return { credentials: creds, refreshed: false }
    }

    const credentials = {
        ...creds,
        assignedNumber: status.newNumber,
        plan: 'inbound_only'
    }

    try {
        saveCredentials(credentials)
    } catch {
        // Still let the current command use the provisioned number.
    }

    return { credentials, refreshed: true }
}
