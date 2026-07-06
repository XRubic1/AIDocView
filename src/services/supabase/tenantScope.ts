/** Throws when a tenant-scoped query is missing client_id. */
export function requireClientId(clientId: string | null | undefined): string {
  if (!clientId?.trim()) {
    throw new Error('clientId is required for tenant-scoped data access')
  }
  return clientId
}
