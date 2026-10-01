import { describe, expect, it } from 'vitest'
import {
  companyRecordScore,
  extractCompanyRecord,
  extractCompanyRecords,
  normalizeSnapshotCompany,
} from '../../supabase/functions/_shared/snapshotCompany'

describe('snapshot company payload', () => {
  it('reads a broker BMC-84 filing from the v3 company record', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        DotNumber: 2214472,
        Status: { Status: 1 },
        Name: { LegalName: 'MATSON LOGISTICS SERVICES LLC' },
        Auths: [
          {
            DocketNumber: 'MC218094',
            Type: 8,
            Status: 1,
            BondReq: true,
            BondFileAmount: 75000,
            Insurances: [
              {
                PolicyNumber: 'K08565582',
                Form: 7,
                Type: 3,
                EffectiveDate: '2013-10-01',
                Status: 1,
                MaxCovAmount: 75000,
                Filer: {
                  Name: 'WESTCHESTER FIRE INSURANCE COMPANY',
                  Phone: '8005550100',
                  Email: 'bonds@westchester.example',
                },
              },
            ],
          },
        ],
      },
    })
    expect(company).not.toBeNull()
    const normalized = normalizeSnapshotCompany(company!)
    const general = normalized.General as Record<string, unknown>
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(general.name).toBe('MATSON LOGISTICS SERVICES LLC')
    expect(normalized.dot_number).toBe(2214472)
    expect(authority.broker_stat).toBe('Active')
    expect(authority.OperatingStatus).toBe('Authorized for Broker Property')
    expect(policies).toHaveLength(1)
    expect(policies[0]?.company_name).toBe('WESTCHESTER FIRE INSURANCE COMPANY')
    expect(policies[0]?.policy_number).toBe('K08565582')
    expect(policies[0]?.bi_pd_maximum_limit).toBe(75000)
    expect(policies[0]?.form_code).toBe(7)
    expect(policies[0]?.phone).toBe('8005550100')
    expect(policies[0]?.email).toBe('bonds@westchester.example')
  })

  it('keeps active liability and surety filings and drops canceled ones', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        DotNumber: 198,
        Status: { Status: 1 },
        Name: { LegalName: 'SAMPLE CARRIER INC' },
        Auths: [
          {
            Type: 1,
            Status: 1,
            DocketNumber: 'MC147039',
            BondReq: false,
            BondFileAmount: 75000,
            Insurances: [
              {
                PolicyNumber: '9C579577',
                Form: 10,
                Type: 1,
                Status: 1,
                MaxCovAmount: 1000000,
                Filer: { Name: 'TRAVELERS PROPERTY CASUALTY COMPANY OF AMERICA' },
              },
              {
                PolicyNumber: 'OLD-LIABILITY',
                Form: 10,
                Status: 3,
                CancellationDate: '2010-01-01',
                MaxCovAmount: 1000000,
                Filer: { Name: 'CANCELED INSURER' },
              },
            ],
          },
          {
            Type: 8,
            Status: 1,
            BondReq: true,
            BondFileAmount: 75000,
            Insurances: [
              {
                PolicyNumber: 'LPM7614896',
                Form: 7,
                Type: 3,
                Status: 1,
                EffectiveDate: '2013-10-01',
                MaxCovAmount: 75000,
                Filer: { Name: 'FIDELITY AND DEPOSIT COMPANY OF MARYLAND' },
              },
            ],
          },
        ],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(authority.common_stat).toBe('Active')
    expect(authority.broker_stat).toBe('Active')
    expect(policies.map((row) => row.company_name)).toEqual([
      'TRAVELERS PROPERTY CASUALTY COMPANY OF AMERICA',
      'FIDELITY AND DEPOSIT COMPANY OF MARYLAND',
    ])
    expect(policies.map((row) => row.policy_number)).toEqual(['9C579577', 'LPM7614896'])
    expect(policies.some((row) => row.company_name === 'Surety bond')).toBe(false)
  })

  it('does not invent an insurer when an active broker filing has no carrier name', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        DotNumber: 2214472,
        Name: { LegalName: 'MATSON LOGISTICS SERVICES LLC' },
        Auths: [{ Type: 8, Status: 1, BondReq: true, BondFileAmount: 75000, Insurances: [] }],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(authority.broker_stat).toBe('Active')
    expect(policies ?? []).toEqual([])
  })

  it('treats an active broker as covered and keeps a real surety filing', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        DotNumber: 2328674,
        Status: { Status: 1 },
        Name: { LegalName: 'FREIGHT MANAGEMENT TEAM INC' },
        Type: 'Broker',
        Insurances: [
          {
            Carrier: 'ALLEGHENY CASUALTY COMPANY',
            PolicyNumber: 'ACC006006227',
            Form: '84',
            Status: 'Active',
            MaxCovAmount: 75000,
          },
        ],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(authority.broker_stat).toBe('Active')
    expect(policies.map((row) => row.company_name)).toEqual(['ALLEGHENY CASUALTY COMPANY'])
    expect(policies[0]?.policy_number).toBe('ACC006006227')
  })

  it('keeps the classic company payload', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        dot_number: 2214472,
        General: { name: 'MATSON LOGISTICS SERVICES LLC', carship: 'Broker', status_code: 'A' },
        Authority: { broker_stat: 'A', common_stat: 'N', contract_stat: 'N', docket_number: '218094' },
        ActiveInsurances: [
          { company_name: 'WESTCHESTER FIRE INSURANCE COMPANY', policy_number: 'K08565582', form_code: 84, bi_pd_maximum_limit: 75000 },
        ],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(authority.broker_stat).toBe('A')
    expect(policies.some((row) => row.company_name === 'WESTCHESTER FIRE INSURANCE COMPANY')).toBe(true)
  })

  it('reads active Filer policies and ignores cancelled ones', () => {
    const company = extractCompanyRecord({
      Success: true,
      Data: {
        DotNumber: 2214472,
        Status: { Status: 1 },
        Name: { LegalName: 'MATSON LOGISTICS SERVICES LLC' },
        Auths: [
          {
            DocketNumber: 'MC218094',
            Type: 8,
            Status: 1,
            BondReq: true,
            BondFileAmount: 75000,
            Insurances: [
              {
                PolicyNumber: 'K08565582',
                Form: 84,
                EffectiveDate: '2013-10-01',
                Status: 1,
                MaxCovAmount: 75000,
                Filer: { Name: 'WESTCHESTER FIRE INSURANCE COMPANY' },
              },
              {
                PolicyNumber: 'OLD-BOND',
                Form: 7,
                EffectiveDate: '2004-04-15',
                CancellationDate: '2007-04-15',
                Status: 3,
                MaxCovAmount: 75000,
                Filer: { Name: 'OLD SURETY COMPANY' },
              },
            ],
          },
        ],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const general = normalized.General as Record<string, unknown>
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(general.name).toBe('MATSON LOGISTICS SERVICES LLC')
    expect(authority.broker_stat).toBe('Active')
    expect(policies.map((row) => row.company_name)).toEqual(['WESTCHESTER FIRE INSURANCE COMPANY'])
    expect(policies[0]?.policy_number).toBe('K08565582')
    expect(policies[0]?.bi_pd_maximum_limit).toBe(75000)
  })

  it('picks the active MC docket when a DOT collision is listed first', () => {
    const records = extractCompanyRecords({
      Success: true,
      Data: [
        {
          DotNumber: 218094,
          Status: { Status: 2 },
          Name: { LegalName: 'VAPCO OIL & GAS CO' },
        },
        {
          DotNumber: 2214472,
          Status: { Status: 1 },
          Name: { LegalName: 'MATSON LOGISTICS SERVICES LLC' },
          Auths: [
            {
              DocketNumber: 'MC218094',
              Type: 8,
              Status: 1,
              BondReq: true,
              BondFileAmount: 75000,
              Insurances: [
                {
                  PolicyNumber: 'K08565582',
                  Form: 7,
                  Status: 1,
                  MaxCovAmount: 75000,
                  Filer: { Name: 'WESTCHESTER FIRE INSURANCE COMPANY' },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(records).toHaveLength(2)
    const best = records.reduce((winner, record) =>
      companyRecordScore(record, '218094') > companyRecordScore(winner, '218094') ? record : winner
    )
    const normalized = normalizeSnapshotCompany(best)
    const general = normalized.General as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(general.name).toBe('MATSON LOGISTICS SERVICES LLC')
    expect(normalized.dot_number).toBe(2214472)
    expect(policies[0]?.company_name).toBe('WESTCHESTER FIRE INSURANCE COMPANY')
    expect(companyRecordScore(records[0]!, '218094')).toBeLessThan(companyRecordScore(records[1]!, '218094'))
  })

  it('reads a v3 Companies list and keeps the broker whose docket matches the MC', () => {
    const records = extractCompanyRecords({
      Companies: [
        {
          DotNumber: 793115,
          Status: { Status: 2 },
          Name: { LegalName: 'MICHAEL D SCHUPP' },
          Auths: [{ DocketNumber: 'MC353732', Type: { Type: 1 }, Status: { Status: 2 } }],
        },
        {
          DotNumber: 2328674,
          Status: { Status: 1 },
          Name: { LegalName: 'FREIGHT MANAGEMENT TEAM INC' },
          Auths: [
            {
              DocketNumber: 'MC793115',
              Type: { Type: 8, Description: 'Broker' },
              Status: { Status: 1, Description: 'Active' },
              Insurances: [
                {
                  PolicyNumber: 'ACC006006227',
                  Form: 7,
                  Status: { Status: 1 },
                  MaxCovAmount: 75000,
                  EffectiveDate: '2025-07-22',
                  Filer: { Name: 'ALLEGHENY CASUALTY COMPANY' },
                },
              ],
            },
          ],
        },
      ],
    })
    const best = records.reduce((winner, record) =>
      companyRecordScore(record, '793115') > companyRecordScore(winner, '793115') ? record : winner
    )
    const normalized = normalizeSnapshotCompany(best)
    const general = normalized.General as Record<string, unknown>
    const authority = normalized.Authority as Record<string, unknown>
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(general.name).toBe('FREIGHT MANAGEMENT TEAM INC')
    expect(normalized.dot_number).toBe(2328674)
    expect(authority.broker_stat).toBe('Active')
    expect(authority.docket_number).toBe('MC793115')
    expect(policies[0]?.company_name).toBe('ALLEGHENY CASUALTY COMPANY')
    expect(policies[0]?.policy_number).toBe('ACC006006227')
  })

  it('reads census broker authority when Auths is null', () => {
    const company = extractCompanyRecord({
      Data: {
        DotNumber: 2328674,
        Status: { Status: 1 },
        Name: { LegalName: 'FREIGHT MANAGEMENT TEAM INC' },
        Auths: null,
        CensusAuths: [{ DocketNumber: 'MC793115', Broker: 2, Common: 1, Contract: 1 }],
      },
    })
    const normalized = normalizeSnapshotCompany(company!)
    const authority = normalized.Authority as Record<string, unknown>
    expect(authority.broker_stat).toBe('Active')
    expect(authority.docket_number).toBe('MC793115')
  })

  it('keeps a named filing when registration Auths is null', () => {
    const normalized = normalizeSnapshotCompany({
      DotNumber: 2328674,
      Status: { Status: 1 },
      Name: { LegalName: 'FREIGHT MANAGEMENT TEAM INC' },
      Auths: null,
      CensusAuths: [{ DocketNumber: 'MC793115', Broker: 2, Common: 1, Contract: 1 }],
      ActiveInsurances: [
        {
          company_name: 'ALLEGHENY CASUALTY COMPANY',
          policy_number: 'ACC006006227',
          form_code: '84',
          bi_pd_maximum_limit: 75000,
        },
      ],
    })
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(policies[0]?.company_name).toBe('ALLEGHENY CASUALTY COMPANY')
    expect(policies[0]?.policy_number).toBe('ACC006006227')
  })

  it('reads a filing nested outside Auths', () => {
    const normalized = normalizeSnapshotCompany({
      DotNumber: 2328674,
      Name: { LegalName: 'FREIGHT MANAGEMENT TEAM INC' },
      Auths: null,
      Census: {
        Dockets: [
          {
            PolicyNumber: 'ACC006006227',
            Form: 7,
            Status: 1,
            MaxCovAmount: 75000,
            Filer: { Name: 'ALLEGHENY CASUALTY COMPANY' },
          },
        ],
      },
    })
    const policies = normalized.ActiveInsurances as Record<string, unknown>[]
    expect(policies[0]?.company_name).toBe('ALLEGHENY CASUALTY COMPANY')
  })
})
