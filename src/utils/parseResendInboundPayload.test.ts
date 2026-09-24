import { describe, expect, it } from 'vitest'
import { parseResendInboundPayload } from './parseResendInboundPayload'

describe('parseResendInboundPayload', () => {
  it('extracts nested Resend data.from / to / text', () => {
    const parsed = parseResendInboundPayload({
      type: 'email.received',
      data: {
        from: { email: 'ap@broker.com', name: 'AP' },
        to: [{ email: 'billing@credyx.net' }],
        subject: 'Re: Invoice INV-1001',
        text: 'We will pay next week.',
        email_id: 'msg_abc',
      },
    })
    expect(parsed.from).toBe('ap@broker.com')
    expect(parsed.to).toBe('billing@credyx.net')
    expect(parsed.subject).toBe('Re: Invoice INV-1001')
    expect(parsed.bodyText).toBe('We will pay next week.')
    expect(parsed.messageId).toBe('msg_abc')
  })

  it('prefers billing@ when multiple recipients', () => {
    const parsed = parseResendInboundPayload({
      data: {
        from: 'ops@broker.com',
        to: ['ops@credyx.net', 'billing@credyx.net'],
        subject: 'Hi',
        html: '<p>Hello <b>world</b></p>',
      },
    })
    expect(parsed.to).toBe('billing@credyx.net')
    expect(parsed.bodyText).toMatch(/Hello world/)
  })

  it('prefers system@ (test inbound) over billing@', () => {
    const parsed = parseResendInboundPayload({
      data: {
        from: 'ops@broker.com',
        to: ['billing@credyx.net', 'system@credyx.net'],
        subject: 'Test',
        text: 'ping',
      },
    })
    expect(parsed.to).toBe('system@credyx.net')
  })

  it('maps Resend catch address to system@credyx.net', () => {
    const parsed = parseResendInboundPayload({
      data: {
        from: 'ops@broker.com',
        to: ['credyx-inbox@pixaipjan.resend.app'],
        subject: 'Test inbound INV-1001',
        text: 'hi',
      },
    })
    expect(parsed.to).toBe('system@credyx.net')
  })

  it('falls back to flat fields', () => {
    const parsed = parseResendInboundPayload({
      from_address: 'a@b.com',
      to_address: 'collections@credyx.net',
      subject: 'Load: L-9',
      body: 'Packet is good',
    })
    expect(parsed.from).toBe('a@b.com')
    expect(parsed.to).toBe('collections@credyx.net')
    expect(parsed.bodyText).toBe('Packet is good')
  })
})
