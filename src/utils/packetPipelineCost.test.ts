import { describe, expect, it } from 'vitest'
import { estimatePacketPipelineCost } from './estimateReviewTokens'

describe('estimatePacketPipelineCost', () => {
  it('prices classify per page and stops the rate-con walk at two pages', () => {
    const estimate = estimatePacketPipelineCost([
      { fileName: '9772-p1.pdf', kind: 'invoice' },
      { fileName: '9772-p2.pdf', kind: 'rate_confirmation' },
      { fileName: '9772-p3.pdf', kind: 'rate_confirmation' },
      { fileName: '9772-p4.pdf', kind: 'rate_confirmation' },
      { fileName: '9772-p5.pdf', kind: 'bill_of_lading' },
      { fileName: '9772-p6.pdf', kind: 'invoice' },
    ])

    const classify = estimate.steps.find((step) => step.id === 'classify')
    const extract = estimate.steps.find((step) => step.id === 'extract')
    const create = estimate.steps.find((step) => step.id === 'create')
    const split = estimate.steps.find((step) => step.id === 'split')
    const verify = estimate.steps.find((step) => step.id === 'verify')

    expect(classify?.calls).toBe(6)
    expect(extract?.calls).toBe(2)
    expect(classify?.estimatedUsd).toBeGreaterThan(0)
    expect(extract?.estimatedUsd).toBeGreaterThan(0)
    expect(split?.estimatedUsd).toBe(0)
    expect(create?.estimatedUsd).toBe(0)
    expect(verify?.estimatedUsd).toBe(0)
    expect(estimate.packetCount).toBe(1)
    expect(estimate.totalUsd).toBeCloseTo(
      (classify?.estimatedUsd ?? 0) + (extract?.estimatedUsd ?? 0),
      6
    )
    expect(estimate.perPacketUsd).toBeCloseTo(estimate.totalUsd, 6)
  })

  it('uses pages actually read on a collapsed rate-con binder', () => {
    const estimate = estimatePacketPipelineCost([
      {
        fileName: '9772.RC.Binder.pdf',
        kind: 'rate_confirmation',
        extract: { totalPagesInFile: 3, pagesReviewed: 1 },
      },
      { fileName: '9772.BOL.Binder.pdf', kind: 'bill_of_lading' },
      { fileName: '9772.Invoice.pdf', kind: 'invoice' },
    ])

    expect(estimate.steps.find((step) => step.id === 'classify')?.calls).toBe(5)
    expect(estimate.steps.find((step) => step.id === 'extract')?.calls).toBe(1)
    expect(estimate.steps.find((step) => step.id === 'extract')?.detail).toContain(
      'pages actually read'
    )
  })

  it('prices a text rate-con read below an image read', () => {
    const text = estimatePacketPipelineCost([
      {
        fileName: '9772.RC.Binder.pdf',
        kind: 'rate_confirmation',
        extract: {
          totalPagesInFile: 3,
          pagesReviewed: 1,
          rateConRead: { textPages: 1, imagePages: 0 },
        },
      },
    ])
    const image = estimatePacketPipelineCost([
      {
        fileName: '9772.RC.Binder.pdf',
        kind: 'rate_confirmation',
        extract: {
          totalPagesInFile: 3,
          pagesReviewed: 1,
          rateConRead: { textPages: 0, imagePages: 1 },
        },
      },
    ])
    const textStep = text.steps.find((step) => step.id === 'extract')
    const imageStep = image.steps.find((step) => step.id === 'extract')
    expect(textStep?.detail).toContain('1 page as text')
    expect(textStep?.detail).toContain('pages actually read')
    expect(imageStep?.detail).toContain('1 page as image')
    expect(textStep?.estimatedUsd ?? 0).toBeGreaterThan(0)
    expect(textStep?.estimatedUsd ?? 0).toBeLessThan(imageStep?.estimatedUsd ?? 0)
  })

  it('does not count the original upload again once its pages exist', () => {
    const estimate = estimatePacketPipelineCost([
      { fileName: '9772.pdf', kind: 'other', extract: { totalPagesInFile: 6 } },
      { fileName: '9772-p1.pdf', kind: 'invoice' },
      { fileName: '9772-p2.pdf', kind: 'rate_confirmation' },
    ])
    expect(estimate.steps.find((step) => step.id === 'classify')?.calls).toBe(2)
    expect(estimate.steps.find((step) => step.id === 'extract')?.calls).toBe(1)
  })
})
