import { classifyFreightAmounts, freightAmountTolerance } from './amountMatching'
import { RateConParse } from '../types/documentPipeline'

export interface AccessorialReconciliationInput {
  rateConParse?: RateConParse
  invoiceAmount?: number | null
  invoiceLineItems?: Array<{ description?: string; amount?: number | null }>
  lumperAmounts?: number[]
}

export interface AccessorialReconciliationResult {
  explained: boolean
  lumperAmount: number
  invoiceMinusRate: number
  message?: string
}

function isLumperDescription(value?: string | null): boolean {
  const text = (value ?? '').toLowerCase()
  return /\blumper\b|unload|unloading|dock|detention|comcheck|efs/.test(text)
}

export function reconcileAccessorialAmount(
  input: AccessorialReconciliationInput
): AccessorialReconciliationResult {
  const rate = input.rateConParse?.rate_total
  const invoice = input.invoiceAmount ?? null
  if (rate == null || invoice == null) {
    return { explained: false, lumperAmount: 0, invoiceMinusRate: 0 }
  }

  const invoiceMinusRate = invoice - rate
  const lumperFromInvoice = (input.invoiceLineItems ?? [])
    .filter((line) => isLumperDescription(line.description))
    .reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const lumperFromPages = (input.lumperAmounts ?? []).reduce((sum, amount) => sum + amount, 0)
  const lumperAmount = Math.max(lumperFromInvoice, lumperFromPages)

  if (lumperAmount <= 0 || invoiceMinusRate <= 0) {
    return { explained: false, lumperAmount, invoiceMinusRate }
  }

  const diff = Math.abs(invoiceMinusRate - lumperAmount)
  const tolerance = freightAmountTolerance(invoice, rate)
  if (diff <= Math.max(tolerance, 1)) {
    return {
      explained: true,
      lumperAmount,
      invoiceMinusRate,
      message: `Rate difference is explained by lumper charges: invoice is $${invoiceMinusRate.toFixed(2)} above rate con and lumper evidence totals $${lumperAmount.toFixed(2)}.`,
    }
  }

  const close = classifyFreightAmounts(invoiceMinusRate, lumperAmount) === 'close'
  if (close) {
    return {
      explained: true,
      lumperAmount,
      invoiceMinusRate,
      message: `Rate difference is close to lumper charges: invoice is $${invoiceMinusRate.toFixed(2)} above rate con and lumper evidence totals $${lumperAmount.toFixed(2)}.`,
    }
  }

  return {
    explained: false,
    lumperAmount,
    invoiceMinusRate,
  }
}
