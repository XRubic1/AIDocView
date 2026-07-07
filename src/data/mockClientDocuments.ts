import { ClientDocument } from '../types/clientDocument'

export const mockClientDocuments: ClientDocument[] = []

export function hydrateClientDocuments(items: ClientDocument[]): void {
  mockClientDocuments.length = 0
  mockClientDocuments.push(...items)
}

export function clearClientDocuments(): void {
  mockClientDocuments.length = 0
}
