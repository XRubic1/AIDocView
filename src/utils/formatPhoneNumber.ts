/**
 * Format a phone string as a US number: (XXX) XXX-XXXX.
 * Strips non-digits; treats a leading country code 1 as optional.
 * Partial input is formatted as the user types.
 */
export function formatPhoneNumber(input: string): string {
  const rawDigits = input.replace(/\D/g, '')
  let digits = rawDigits

  // US country code — keep only the 10-digit national number for display.
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  } else if (digits.length > 10 && digits.startsWith('1')) {
    digits = digits.slice(1, 11)
  } else {
    digits = digits.slice(0, 10)
  }

  if (digits.length === 0) return ''
  if (digits.length <= 3) return digits
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
