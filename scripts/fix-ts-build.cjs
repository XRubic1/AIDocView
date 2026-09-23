const fs = require('fs');
const path = require('path');
const root = 'c:/Users/Work/Desktop/Tools/AIDocView-main';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(path.join(root, rel), content, 'utf8'); }
function patch(rel, fn) { write(rel, fn(read(rel))); }

// AccountingModal
patch('src/components/batches/AccountingModal.tsx', f => {
  if (!f.includes("from '../../types/client'")) {
    return f.replace(
      "import { updateBatch } from '../../data/mockBatches'",
      "import { updateBatch } from '../../data/mockBatches'\nimport type { Client } from '../../types/client'"
    );
  }
  return f;
});

// AdminInvoiceDetailView - careful patches
patch('src/components/batches/AdminInvoiceDetailView.tsx', f => {
  f = f.replace(
    "const adminActor = getAdminUserDisplayName(authUser) ?? authUser?.email ?? 'Admin'",
    "const adminActor = getAdminUserDisplayName(authUser?.email ?? null) ?? authUser?.email ?? 'Admin'"
  );
  f = f.replace('invoice_id: invoice.id,', 'invoice_id: currentInvoice.id,');
  f = f.replace('const handleCloseInvoice = () => {\n    if (!invoice) return', 'const handleCloseInvoice = () => {\n    if (!currentInvoice) return');
  const dup = '\n  const invoice = currentInvoice\n';
  if (f.includes(dup)) {
    f = f.replace(dup, '\n  const activeInvoice = currentInvoice\n');
    const idx = f.indexOf('  const activeInvoice = currentInvoice');
    const before = f.slice(0, idx);
    let after = f.slice(idx);
    after = after.replace(/\binvoice\./g, 'activeInvoice.');
    after = after.replace(/\(\s*invoice\s*\)/g, '(activeInvoice)');
    after = after.replace(/\binvoice\s*===/g, 'activeInvoice ===');
    after = after.replace(/\binvoice\s*!==/g, 'activeInvoice !==');
    after = after.replace(/!activeInvoice\?/g, '!invoice?'); // fix editedInvoice init
    f = before + after;
  }
  return f;
});

console.log('batch1 done');
