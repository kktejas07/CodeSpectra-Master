/** pdfjs-dist ships no types for the worker bundle; lib/rag/sources/uploads.ts only passes it to pdfjs. */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
