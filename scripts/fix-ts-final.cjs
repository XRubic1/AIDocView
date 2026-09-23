const fs = require('fs');
const root = 'c:/Users/Work/Desktop/Tools/AIDocView-main';
let f = fs.readFileSync(root + '/src/pages/ClientBatches.tsx', 'utf8');
f = f.replace(
  "import ClientBatchesListView, { getBatchStatusBadge } from '../components/client/ClientBatchesListView'",
  "import ClientBatchesListView from '../components/client/ClientBatchesListView'"
);
fs.writeFileSync(root + '/src/pages/ClientBatches.tsx', f);
f = fs.readFileSync(root + '/src/utils/loadReviewSummary.ts', 'utf8');
f = f.replace('ExcelFieldMatch, ', '');
fs.writeFileSync(root + '/src/utils/loadReviewSummary.ts', f);
