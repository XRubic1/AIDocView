/**
 * Tour step for “how to submit invoices” (runs after dashboard tour).
 */

export type SubmitTourTargetId =
  | 'navUpload'
  | 'navSubmitDocs'
  | 'submitPanel'
  | 'submitDropzone'

export type SubmitTourStep = {
  id: string
  target: SubmitTourTargetId | null
  title: string
  body: string
  /** Navigate here when this step becomes active (if not already). */
  navigateTo?: string
}

export const SUBMIT_INVOICE_TOUR_STEPS: SubmitTourStep[] = [
  {
    id: 'uploadBtn',
    target: 'navUpload',
    title: 'Submit from here',
    body: 'Use Upload anytime to send load paperwork. Credyx turns it into invoices for you.',
  },
  {
    id: 'submitNav',
    target: 'navSubmitDocs',
    title: 'Or use Submit docs',
    body: 'You can also open Submit docs in the sidebar — same destination as Upload.',
  },
  {
    id: 'submitPage',
    target: 'submitPanel',
    title: 'Your submit workspace',
    body: 'This is where you send paperwork. Drop files here and Credyx handles the rest.',
    navigateTo: '/client/batches?tab=create',
  },
  {
    id: 'dropzone',
    target: 'submitDropzone',
    title: 'Add your files',
    body: 'Drag PODs, BOLs, and rate cons here — or browse to attach them. Then submit when you’re ready.',
    navigateTo: '/client/batches?tab=create',
  },
]
