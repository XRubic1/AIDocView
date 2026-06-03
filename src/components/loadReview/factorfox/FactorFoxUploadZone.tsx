import { type Ref, type RefObject } from 'react'

interface FactorFoxUploadZoneProps {
  inputRef: RefObject<HTMLInputElement | null>
  accept: string
  onFiles: (files: FileList) => void
  label?: string
  sublabel?: string
  compact?: boolean
}

export default function FactorFoxUploadZone({
  inputRef,
  accept,
  onFiles,
  label = 'Add PDFs',
  sublabel,
  compact = false,
}: FactorFoxUploadZoneProps) {
  const handleFiles = (files: FileList) => {
    if (files.length) onFiles(files)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`engine-upload-zone ${compact ? 'compact' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <span className="engine-upload-icon">↑</span>
      <span className="engine-upload-label">{label}</span>
      {sublabel && !compact && <span className="engine-upload-sub">{sublabel}</span>}
      <input
        ref={inputRef as Ref<HTMLInputElement>}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
