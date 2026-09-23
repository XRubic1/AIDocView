const fs = require('fs');
const path = require('path');
const root = 'c:/Users/Work/Desktop/Tools/AIDocView-main';
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, c) { fs.writeFileSync(path.join(root, rel), c, 'utf8'); }
function patch(rel, fn) { write(rel, fn(read(rel))); }

// AdminInvoiceDetailView - handleCloseInvoice uses currentInvoice
patch('src/components/batches/AdminInvoiceDetailView.tsx', f => {
  const start = f.indexOf('const handleCloseInvoice = () => {');
  const end = f.indexOf('\n  const handle', start + 1);
  if (start === -1) return f;
  const end2 = f.indexOf('\n  // ', start + 500); // find next section
  let blockStart = start;
  let blockEnd = f.indexOf('\n  const handle', start + 20);
  if (blockEnd === -1) blockEnd = f.indexOf('\n  const ', start + 20);
  // find closing of handleCloseInvoice by matching alert Invoice closed
  const marker = "alert('Invoice closed successfully')";
  const mIdx = f.indexOf(marker, start);
  if (mIdx === -1) return f;
  blockEnd = f.indexOf('\n  }', mIdx) + 4;
  let block = f.slice(blockStart, blockEnd);
  block = block.replace(/\binvoice\b/g, 'currentInvoice');
  return f.slice(0, blockStart) + block + f.slice(blockEnd);
});

// SimpleUploadModal
patch('src/components/client/SimpleUploadModal.tsx', f =>
  f.replace(/(\{\s*\n\s*)clientId,/, '$1clientId: _clientId,').replace(/clientName,/, 'clientName: _clientName,')
);

// InvoiceDetailTab - remove AlertCircle from import
patch('src/components/invoices/InvoiceDetailTab.tsx', f => f.replace(', AlertCircle', ''));

// reviewExplainChatService
patch('src/services/reviewExplainChatService.ts', f => {
  if (!f.includes('createChatMessage')) {
    f = f.replace(
      'const CHAT_MODEL = AI_REVIEW_CONFIG.CHAT_MODEL',
      `const CHAT_MODEL = AI_REVIEW_CONFIG.CHAT_MODEL\n\n/** Build a chat row for the explain panel. */\nexport function createChatMessage(role: 'user' | 'assistant', content: string): ExplainChatMessage {\n  return {\n    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),\n    role,\n    content,\n    createdAt: new Date().toISOString(),\n  }\n}`
    );
  }
  f = f.replace(
    'const estimatedCostUsd = usageFromOpenAIResponse(data, CHAT_MODEL)',
    'const estimatedCostUsd = usageFromOpenAIResponse(data as Record<string, unknown>, CHAT_MODEL).estimatedCostUsd'
  );
  return f;
});

// useLandingLiveData
patch('src/hooks/useLandingLiveData.ts', f => {
  f = f.replace(/^\s*EXAMPLE_BATCH_LOAD_COUNT,\n/m, '');
  f = f.replace(/^\s*TYPICAL_SECONDS_PER_LOAD,\n/m, '');
  f = f.replace(/^\s*estimateBatchMinutes,\n/m, '');
  return f;
});

// AdminDashboard
patch('src/pages/AdminDashboard.tsx', f => {
  f = f.replace('  const allAuditLogs = getAllAuditLogs()\n', '');
  f = f.replace("import { getAllAuditLogs } from '../utils/auditLogger'\n", '');
  f = f.replace(
    'const paidDate = new Date(inv.approved_at)',
    'const paidDate = new Date(inv.approved_at!)'
  );
  f = f.replace(
    'forceCloseRate={parseFloat(forceCloseRate)}',
    'forceCloseRate={parseFloat(String(forceCloseRate))}'
  );
  f = f.replace(
    'avgReviewTime={parseFloat(avgReviewTime)}',
    'avgReviewTime={parseFloat(String(avgReviewTime))}'
  );
  return f;
});

// AuditDashboard
patch('src/pages/AuditDashboard.tsx', f => {
  f = f.replace(', Calendar, User', '');
  f = f.replace('const severityColors', 'const _severityColors');
  return f;
});

// Brokers
patch('src/pages/Brokers.tsx', f => f.replace(', EmailCategory, PhoneCategory', ''));

// ClientBatches
patch('src/pages/ClientBatches.tsx', f => {
  f = f.replace("import { formatCurrency } from '../utils/format'\n", '');
  f = f.replace("import { formatDate } from '../utils/format'\n", '');
  if (!f.includes('ManualBatchInvoiceFormData')) {
    f = f.replace(
      "import ClientManualBatchForm from '../components/client/ClientManualBatchForm'",
      "import ClientManualBatchForm, { type ManualBatchInvoiceFormData } from '../components/client/ClientManualBatchForm'"
    );
  }
  f = f.replace(
    /interface InvoiceFormData \{[\s\S]*?documents\?: InvoiceDocument\[\]\n\}/,
    'interface InvoiceFormData extends Omit<ManualBatchInvoiceFormData, \'documents\'> {\n  documents?: InvoiceDocument[]\n}'
  );
  f = f.replace('const getStatusBadge', 'const _getStatusBadge');
  f = f.replace('const clientNameForPdf', 'const _clientNameForPdf');
  f = f.replace(
    'const handleUploadDocumentsForInvoice = (invoice: InvoiceFormData, index: number)',
    'const handleUploadDocumentsForInvoice = (invoice: ManualBatchInvoiceFormData, index: number)'
  );
  f = f.replace(
    'const handleViewDocuments = (invoice: InvoiceFormData)',
    'const handleViewDocuments = (invoice: ManualBatchInvoiceFormData)'
  );
  return f;
});

// ClientDocuments
patch('src/pages/ClientDocuments.tsx', f => f.replace('function getCategoryPill', 'function _getCategoryPill'));

// Clients.tsx - simplify else branch
patch('src/pages/Clients.tsx', f =>
  f.replace(
    /return inv\.status === 'paid' \|\| inv\.status === 'approved' \|\| \(inv\.status !== 'hold' && inv\.status !== 'pending'\)/g,
    "return inv.status === 'paid' || inv.status === 'approved'"
  )
);

// HowItWorks - fix duplicate transform
patch('src/pages/HowItWorks.tsx', f => {
  return f.replace(
    `transform: 'translate(-50%, -40%)',
                     width: '100%',
                     maxWidth: '80rem',
                     padding: '0 1.5rem',
                     opacity: isActive ? 1 : 0,
                     transform: \`translate(-50%, -40%) scale(\${isActive ? 1 : 0.8}) \${`,
    `width: '100%',
                     maxWidth: '80rem',
                     padding: '0 1.5rem',
                     opacity: isActive ? 1 : 0,
                     transform: \`translate(-50%, -40%) scale(\${isActive ? 1 : 0.8}) \${`
  );
});

// LoadReviewWorkbench
patch('src/pages/LoadReviewWorkbench.tsx', f =>
  f.replace(/\n                compact\n\n                label="Add PDF"\n                compact/, '\n                label="Add PDF"\n                compact')
);

// Settings
patch('src/pages/Settings.tsx', f => {
  f = f.replace("import { useState, useEffect } from 'react'", "import { useState } from 'react'");
  f = f.replace(
    `await saveArPolicy({
          collectionsOverdueDays: Number(invoiceSettings.agingBuckets.bucket1) || 15,
          clientUrgentDays: 25,
          criticalDays: 60,
          forceCloseDays: Number(invoiceSettings.forceCloseDays) || 90,
          agingBuckets: [
            Number(invoiceSettings.agingBuckets.bucket1) || 15,
            Number(invoiceSettings.agingBuckets.bucket2) || 30,
            Number(invoiceSettings.agingBuckets.bucket3) || 45,
            Number(invoiceSettings.agingBuckets.bucket4) || 60,
            Number(invoiceSettings.agingBuckets.bucket5) || 90,
          ] as [15, 30, 45, 60, 90],
        })`,
    `await saveArPolicy({
          collectionsOverdueDays: (Number(invoiceSettings.agingBuckets.bucket1) || 15) as typeof import('../utils/invoiceAging').AR_POLICY.collectionsOverdueDays,
          clientUrgentDays: 25,
          criticalDays: 60,
          forceCloseDays: (Number(invoiceSettings.forceCloseDays) || 90) as typeof import('../utils/invoiceAging').AR_POLICY.forceCloseDays,
          agingBuckets: [
            Number(invoiceSettings.agingBuckets.bucket1) || 15,
            Number(invoiceSettings.agingBuckets.bucket2) || 30,
            Number(invoiceSettings.agingBuckets.bucket3) || 45,
            Number(invoiceSettings.agingBuckets.bucket4) || 60,
            Number(invoiceSettings.agingBuckets.bucket5) || 90,
          ] as typeof import('../utils/invoiceAging').AR_POLICY.agingBuckets,
        })`
  );
  return f;
});

// Users
patch('src/pages/Users.tsx', f =>
  f.replace(
    "const actorName = getAdminUserDisplayName(authUser) ?? authUser?.email ?? 'Admin'",
    "const actorName = getAdminUserDisplayName(authUser?.email ?? null) ?? authUser?.email ?? 'Admin'"
  )
);

// documentReviewService
patch('src/services/documentReviewService.ts', f =>
  f.replace(
    'const receiverPasses: Array<{ receiver: BolAudit[\'signatures\'][\'receiver\']; cropVerified: boolean }> =',
    'const receiverPasses: Array<{ receiver: BolAudit[\'signatures\'][\'receiver\']; cropVerified: boolean; localizationTrusted?: boolean }> ='
  )
);

// paymentCorrectionService
patch('src/services/paymentCorrectionService.ts', f => f.replace('const isOver', 'const _isOver'));

// aiTrainingStore, annotatableFields, reviewRulesStore, paperworkSender
patch('src/utils/aiTrainingStore.ts', f => f.replace(/^import.*RateConFieldKey.*\n/m, ''));
patch('src/utils/annotatableFields.ts', f => f.replace(', FieldRegionBox', ''));
patch('src/utils/reviewRulesStore.ts', f => f.replace(/\s*BuiltInReviewRuleOverride,\n/, '\n'));
patch('src/utils/paperworkSender.ts', f => f.replace(/^import.*Broker.*\n/m, ''));

// applyPageClassificationCorrections
patch('src/utils/applyPageClassificationCorrections.ts', f =>
  f.replace("extraction.documentType = 'invoice'", "extraction.documentType = 'invoice' as import('../types/documentReview').DocumentType")
);

// extractBatchFields
patch('src/utils/extractBatchFields.ts', f => {
  f = f.replace(
    `return {
    loadNumber: inv.load_number ?? stemLoad ?? rateCon?.load_number,
    invoiceLoadNumber: inv.load_number ?? stemLoad,
    broker: inv.broker_name ?? rateCon?.broker_name,
    carrier: inv.carrier_name ?? rateCon?.carrier_name,
    amount: inv.amount_total ?? rateCon?.rate_total,
    invoiceNumber: inv.invoice_number ?? invoiceNumberFromFileName(unit.fileName),
    invoiceDate: inv.invoice_date,
  }`,
    `return {
    loadNumber: (inv.load_number ?? stemLoad ?? rateCon?.load_number) ?? undefined,
    invoiceLoadNumber: (inv.load_number ?? stemLoad) ?? undefined,
    broker: (inv.broker_name ?? rateCon?.broker_name) ?? undefined,
    carrier: (inv.carrier_name ?? rateCon?.carrier_name) ?? undefined,
    amount: (inv.amount_total ?? rateCon?.rate_total) ?? undefined,
    invoiceNumber: (inv.invoice_number ?? invoiceNumberFromFileName(unit.fileName)) ?? undefined,
    invoiceDate: inv.invoice_date ?? undefined,
  }`
  );
  return f;
});

// invoiceBilledMatch
patch('src/utils/invoiceBilledMatch.ts', f => {
  f = f.replace(
    `  const row: LoadSheetRow = {
    rowIndex: 0,
    loadNumber: invoice.load_number,
    broker: invoice.broker_name,
    carrier: invoice.carrier_name,
    amount: invoice.amount_total ?? undefined,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
  }`,
    `  const row: LoadSheetRow = {
    rowIndex: 0,
    loadNumber: invoice.load_number ?? undefined,
    broker: invoice.broker_name ?? undefined,
    carrier: invoice.carrier_name ?? undefined,
    amount: invoice.amount_total ?? undefined,
    invoiceNumber: invoice.invoice_number ?? undefined,
    invoiceDate: invoice.invoice_date ?? undefined,
  }`
  );
  return f;
});

// loadReviewSummary
patch('src/utils/loadReviewSummary.ts', f => {
  f = f.replace('function excelStatusToCheck', 'function _excelStatusToCheck');
  f = f.replace('function excelField', 'function _excelField');
  f = f.replace(
    'matchBrokerCarrierFromExcel(excelFileName, excelDebtor, docBroker, docCarrier)',
    'matchBrokerCarrierFromExcel(excelFileName, excelDebtor ?? undefined, docBroker, docCarrier)'
  );
  f = f.replace(
    'cross.multi_stop_coverage.details,\n        { documentValue: stopsDisplay }',
    '(cross.multi_stop_coverage.details ?? \'\'),\n        { documentValue: stopsDisplay }'
  );
  return f;
});

// multiInvoiceValidation
patch('src/utils/multiInvoiceValidation.ts', f => {
  f = f.replace('excelAmount?: number | null,', '_excelAmount?: number | null,');
  f = f.replace(
    'primaryLoadNumber: options?.primaryLoadNumber ?? rateConParse?.load_number,',
    'primaryLoadNumber: (options?.primaryLoadNumber ?? rateConParse?.load_number) ?? undefined,'
  );
  return f;
});

// perPacketVerification
patch('src/utils/perPacketVerification.ts', f =>
  f.replace(
    'humanizeReviewMessage(cross.multi_stop_coverage.details)',
    'humanizeReviewMessage(cross.multi_stop_coverage.details ?? \'\')'
  )
);

// rateConParseMapper - add typed helpers
patch('src/utils/rateConParseMapper.ts', f => {
  if (!f.includes('fromRawString')) {
    f = f.replace(
      `  const fromRaw = (key: RateConFieldKey) =>
    rawFields?.[key] ? parseRawField<string | number>(rawFields[key]) : undefined

  const fields: RateConFields = {
    carrier: fromRaw('carrier') ?? {`,
      `  const fromRaw = (key: RateConFieldKey) =>
    rawFields?.[key] ? parseRawField<string | number>(rawFields[key]) : undefined

  const fromRawString = (key: RateConFieldKey) => {
    const field = fromRaw(key)
    if (!field) return undefined
    const value = field.value
    return { ...field, value: value == null ? undefined : String(value) }
  }

  const fromRawNumber = (key: RateConFieldKey) => {
    const field = fromRaw(key)
    if (!field) return undefined
    const raw = field.value
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return { ...field, value: Number.isFinite(num) ? num : undefined }
  }

  const fields: RateConFields = {
    carrier: fromRawString('carrier') ?? {`
    );
    f = f.replace("broker: fromRaw('broker')", "broker: fromRawString('broker')");
    f = f.replace("rate: fromRaw('rate')", "rate: fromRawNumber('rate')");
    f = f.replace("emailDomain: fromRaw('emailDomain')", "emailDomain: fromRawString('emailDomain')");
    f = f.replace("loadNumber: fromRaw('loadNumber')", "loadNumber: fromRawString('loadNumber')");
    f = f.replace("pickup: fromRaw('pickup')", "pickup: fromRawString('pickup')");
    f = f.replace("drop: fromRaw('drop')", "drop: fromRawString('drop')");
  }
  return f;
});

console.log('batch2 done');
