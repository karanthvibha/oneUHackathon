import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type PdfPreviewProps = {
  file: File
}

export default function PdfPreview({ file }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [rendering, setRendering] = useState(true)

  useEffect(() => {
    let cancelled = false
    let doc: pdfjsLib.PDFDocumentProxy | null = null
    const renderTasks: pdfjsLib.RenderTask[] = []
    const textLayers: pdfjsLib.TextLayer[] = []

    async function render() {
      try {
        const buffer = await file.arrayBuffer()
        const loadingTask = pdfjsLib.getDocument({ data: buffer })
        doc = await loadingTask.promise
        if (cancelled) return
        setPageCount(doc.numPages)

        const container = containerRef.current
        if (!container) return

        container.innerHTML = ''

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          if (cancelled) return
          const page = await doc.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.25 })

          const pageWrap = document.createElement('div')
          pageWrap.className = 'pdf-page'

          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-canvas'
          const context = canvas.getContext('2d')
          if (!context) return

          const dpr = window.devicePixelRatio || 1
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = `${viewport.width}px`
          canvas.style.height = `${viewport.height}px`

          pageWrap.appendChild(canvas)

          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'textLayer'
          textLayerDiv.style.setProperty(
            '--scale-factor',
            String(viewport.scale),
          )
          pageWrap.appendChild(textLayerDiv)

          container.appendChild(pageWrap)

          const renderTask = page.render({
            canvasContext: context,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          })
          renderTasks.push(renderTask)

          const textContent = await page.getTextContent()
          if (cancelled) return

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          })
          textLayers.push(textLayer)
          await textLayer.render()

          await renderTask.promise
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not render this PDF.')
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    render()

    return () => {
      cancelled = true
      renderTasks.forEach((task) => {
        try {
          task.cancel()
        } catch {
          // ignore cancel errors
        }
      })
      textLayers.forEach((layer) => {
        try {
          layer.cancel()
        } catch {
          // ignore cancel errors
        }
      })
      doc?.destroy()
    }
  }, [file])

  return (
    <div className="pdf-preview">
      {rendering && <p className="pdf-status">Rendering PDF…</p>}
      {error && <p className="pdf-status pdf-error">{error}</p>}
      {pageCount > 0 && (
        <p className="pdf-status pdf-count">
          {pageCount} page{pageCount === 1 ? '' : 's'}
        </p>
      )}
      <div ref={containerRef} className="pdf-pages" />
    </div>
  )
}