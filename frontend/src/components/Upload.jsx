import { useRef, useState } from 'react'

import { uploadDocument } from '../lib/api.js'

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt'])

function getFileExtension(fileName) {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex).toLowerCase() : ''
}

export default function Upload({
  token,
  documents,
  documentsLoaded = true,
  onDocumentUploaded,
  onAuthError,
  tourTargetId = 'upload-dropzone-cta',
  tourActive = false,
}) {
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef(null)

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || uploading) return

    const supportedFiles = files.filter((file) => SUPPORTED_EXTENSIONS.has(getFileExtension(file.name)))
    const unsupportedFiles = files.filter((file) => !SUPPORTED_EXTENSIONS.has(getFileExtension(file.name)))

    if (!supportedFiles.length) {
      setStatus('Files are visible now, but upload support is currently only for PDF, DOCX, and TXT.')
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      return
    }

    setUploading(true)
    setStatus('')

    try {
      for (const file of supportedFiles) {
        const response = await uploadDocument(token, file)
        onDocumentUploaded(response.document)
      }

      if (unsupportedFiles.length) {
        setStatus(
          `${supportedFiles.length} file${supportedFiles.length > 1 ? 's' : ''} uploaded. ` +
          `Skipped unsupported file${unsupportedFiles.length > 1 ? 's' : ''}: PDF, DOCX, TXT only.`
        )
      } else {
        setStatus(
          `${supportedFiles.length} file${supportedFiles.length > 1 ? 's' : ''} uploaded successfully.`
        )
      }
    } catch (err) {
      if (err.code === 'AUTH_ERROR') {
        onAuthError?.()
        return
      }
      setStatus(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Documents</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900">Upload your knowledge base</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Drop in PDF, DOCX, and TXT files. NeuroAI indexes the content and turns it into an
              assistant-ready workspace for summaries, key points, and explanations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-2">PDF</span>
            <span className="rounded-full bg-slate-100 px-3 py-2">DOCX</span>
            <span className="rounded-full bg-slate-100 px-3 py-2">TXT</span>
          </div>
        </div>

        <div
          className={`mt-6 rounded-[28px] border-2 border-dashed p-12 text-center transition-all ${
            tourActive
              ? 'neuro-tour-pulse border-amber-300 bg-amber-50 shadow-[0_24px_70px_rgba(251,191,36,0.18)]'
              : dragActive
                ? 'border-primary bg-blue-50 shadow-[0_24px_70px_rgba(59,130,246,0.14)]'
                : 'border-slate-300 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] hover:border-primary'
          } ${uploading ? 'pointer-events-none opacity-70' : ''}`}
          onDragOver={(e) => {
            if (uploading) return
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(e) => {
            if (uploading) return
            e.preventDefault()
            setDragActive(false)
          }}
          onDrop={(e) => {
            if (uploading) return
            e.preventDefault()
            setDragActive(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            id="file-upload"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <label
            htmlFor="file-upload"
            id={tourTargetId}
            className={`block ${uploading ? 'cursor-wait' : 'cursor-pointer'}`}
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-2xl text-white shadow-lg">
              {uploading ? (
                <span
                  className="neuro-loader neuro-loader-md"
                  style={{ borderColor: 'rgba(255,255,255,0.28)', borderTopColor: '#fff' }}
                  aria-hidden="true"
                />
              ) : (
                '+'
              )}
            </div>
            <p className="mt-5 text-xl font-semibold text-slate-900">Drop files here</p>
            <p className="mt-2 text-sm text-slate-500">
              {uploading
                ? 'Uploading files and indexing them now...'
                : 'All files are visible in the picker. Upload support is currently PDF, DOCX, and TXT.'}
            </p>
            <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              {uploading ? 'Uploading...' : 'Browse Files'}
            </div>
          </label>
        </div>
      </div>

      {status ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {status}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Indexed Documents</h3>
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {documents.length}
          </span>
        </div>

        {documents.length ? (
          <ul className="mt-5 space-y-3">
            {documents.map((document) => (
              <li key={document.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{document.file_name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {document.content_preview || 'Document indexed successfully.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
                    Ready
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : !documentsLoaded ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            Syncing your saved documents...
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No documents uploaded yet. Start with your first file and NeuroAI will prepare it for chat.
          </div>
        )}
      </div>
    </div>
  )
}
