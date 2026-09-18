/** Platform billing constants (collection fee comes from client fee_terms). */

export const PLATFORM_APP_FEE_MONTHLY = 99

/**
 * @deprecated Pay-by is end of the month after the billing period
 * (e.g. August invoice → September 30), not N days from issue.
 */
export const BILL_PAYMENT_TERMS_DAYS = 30
export const BILL_LOCK_AFTER_DAYS = 90
export const BILL_WARNING_DAYS = 60
export const BILL_REMINDER_DAYS = 30
