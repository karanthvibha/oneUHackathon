import { FormEvent, useMemo, useRef, useState, type DragEvent } from 'react'
import './App.css'

type View = 'tutor' | 'plan' | 'notes' | 'files'

type Message = { id: number; role: 'ai' | 'you'; text: string }
type Folder = { id: string; name: string }
type Note = { id: number; title: string; body: string; folderId: string }
type Material = {
  id: number
  name: string
  type: string
  folderId: string
  addedAt: string
  isStudyMaterial: boolean
}
type PlanItem = { id: string; day: string; title: string; minutes: number; done: boolean; materialId?: number }

const INBOX = 'inbox'
const ALL = 'all'

const navItems: { id: View; label: string; hint: string; icon: string }[] = [
  { id: 'tutor', label: 'AI Tutor', hint: 'Ask, quiz, explain', icon: '✦' },
  { id: 'plan', label: 'Study Plan', hint: 'This week’s path', icon: '▣' },
  { id: 'notes', label: 'Smart Notes', hint: 'Capture & connect', icon: '✎' },
  { id: 'files', label: 'Files', hint: 'Upload & organize', icon: '▤' },
]

const modelOptions = ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro', 'Llama 3.1 70B']

const seedMaterialFolders: Folder[] = [
  { id: INBOX, name: 'Inbox' },
  { id: 'lectures', name: 'Lecture Notes' },
  { id: 'slides', name: 'Slides' },
  { id: 'readings', name: 'Readings' },
]

const seedMaterials: Material[] = [
  {
    id: 1,
    name: 'Cell Biology — Week 3.pdf',
    type: 'Lecture notes',
    folderId: 'lectures',
    addedAt: '2026-09-12T12:00:00',
    isStudyMaterial: false,
  },
  {
    id: 2,
    name: 'Enzyme Kinetics.pptx',
    type: 'Slides',
    folderId: 'slides',
    addedAt: '2026-09-13T12:00:00',
    isStudyMaterial: false,
  },
  {
    id: 3,
    name: 'Metabolism Reading.pdf',
    type: 'Reading',
    folderId: 'readings',
    addedAt: '2026-09-14T12:00:00',
    isStudyMaterial: false,
  },
]

const languages = [
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
]

const translationDict: Record<string, Record<string, string>> = {
  es: {
    hello: 'hola',
    hi: 'hola',
    "i'm": 'soy',
    i: 'yo',
    you: 'tú',
    your: 'tu',
    "you're": 'eres',
    tutor: 'tutor',
    this: 'este',
    screen: 'pantalla',
    is: 'es',
    only: 'solo',
    for: 'para',
    now: 'ahora',
    no: 'no',
    api: 'API',
    wired: 'conectado',
    up: 'arriba',
    the: 'el',
    a: 'un',
    an: 'un',
    and: 'y',
    to: 'a',
    of: 'de',
    what: 'qué',
    explain: 'explicar',
    question: 'pregunta',
    ask: 'preguntar',
    yes: 'sí',
    can: 'puede',
    studying: 'estudiando',
    study: 'estudiar',
    notes: 'notas',
    plan: 'plan',
    help: 'ayuda',
  },
  fr: {
    hello: 'bonjour',
    hi: 'salut',
    "i'm": 'je suis',
    i: 'je',
    you: 'tu',
    your: 'ton',
    "you're": 'tu es',
    tutor: 'tuteur',
    this: 'ce',
    screen: 'écran',
    is: 'est',
    only: 'seulement',
    for: 'pour',
    now: 'maintenant',
    no: 'non',
    api: 'API',
    wired: 'câblé',
    up: 'en haut',
    the: 'le',
    a: 'un',
    an: 'un',
    and: 'et',
    to: 'à',
    of: 'de',
    what: 'quoi',
    explain: 'expliquer',
    question: 'question',
    ask: 'demander',
    yes: 'oui',
    can: 'peut',
    studying: 'étudiant',
    study: 'étudier',
    notes: 'notes',
    plan: 'plan',
    help: 'aide',
  },
  de: {
    hello: 'hallo',
    hi: 'hallo',
    "i'm": 'ich bin',
    i: 'ich',
    you: 'du',
    your: 'dein',
    "you're": 'du bist',
    tutor: 'Tutor',
    this: 'dies',
    screen: 'Bildschirm',
    is: 'ist',
    only: 'nur',
    for: 'für',
    now: 'jetzt',
    no: 'nein',
    api: 'API',
    wired: 'verkabelt',
    up: 'oben',
    the: 'der',
    a: 'ein',
    an: 'ein',
    and: 'und',
    to: 'zu',
    of: 'von',
    what: 'was',
    explain: 'erklären',
    question: 'Frage',
    ask: 'fragen',
    yes: 'ja',
    can: 'kann',
    studying: 'lernend',
    study: 'lernen',
    notes: 'Notizen',
    plan: 'Plan',
    help: 'Hilfe',
  },
  it: {
    hello: 'ciao',
    hi: 'ciao',
    "i'm": 'sono',
    i: 'io',
    you: 'tu',
    your: 'tuo',
    "you're": 'sei',
    tutor: 'tutor',
    this: 'questo',
    screen: 'schermo',
    is: 'è',
    only: 'solo',
    for: 'per',
    now: 'ora',
    no: 'no',
    api: 'API',
    wired: 'cablato',
    up: 'su',
    the: 'il',
    a: 'un',
    an: 'un',
    and: 'e',
    to: 'a',
    of: 'di',
    what: 'cosa',
    explain: 'spiegare',
    question: 'domanda',
    ask: 'chiedere',
    yes: 'sì',
    can: 'può',
    studying: 'studiando',
    study: 'studiare',
    notes: 'note',
    plan: 'piano',
    help: 'aiuto',
  },
  pt: {
    hello: 'olá',
    hi: 'oi',
    "i'm": 'sou',
    i: 'eu',
    you: 'você',
    your: 'seu',
    "you're": 'você é',
    tutor: 'tutor',
    this: 'este',
    screen: 'tela',
    is: 'é',
    only: 'apenas',
    for: 'para',
    now: 'agora',
    no: 'não',
    api: 'API',
    wired: 'conectado',
    up: 'acima',
    the: 'o',
    a: 'um',
    an: 'um',
    and: 'e',
    to: 'para',
    of: 'de',
    what: 'o que',
    explain: 'explicar',
    question: 'pergunta',
    ask: 'perguntar',
    yes: 'sim',
    can: 'pode',
    studying: 'estudando',
    study: 'estudar',
    notes: 'notas',
    plan: 'plano',
    help: 'ajuda',
  },
}

function simulateTranslation(text: string, lang: string) {
  const dict = translationDict[lang]
  if (!dict) return text
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token
      const cleaned = token.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’]/g, '')
      if (!cleaned) return token
      const key = cleaned.toLowerCase()
      const translated = dict[key]
      return translated ? translated + token.slice(cleaned.length) : token
    })
    .join('')
}

const seedFolders: Folder[] = [
  { id: INBOX, name: 'Inbox' },
  { id: 'biology', name: 'Biology' },
  { id: 'stats', name: 'Stats' },
  { id: 'language', name: 'Language' },
]

const seedNotes: Note[] = [
  {
    id: 1,
    title: 'Photosynthesis, in one pass',
    body: 'Light reactions split water; Calvin cycle fixes carbon. Rate limited by CO₂, light, and temperature.',
    folderId: 'biology',
  },
  {
    id: 2,
    title: 'Bayes in practice',
    body: 'Prior × likelihood → posterior. Update beliefs as evidence arrives; don’t treat p-values as the story.',
    folderId: 'stats',
  },
  {
    id: 3,
    title: 'French irregulars',
    body: 'être, avoir, aller, faire. Drill present tense first, then passé composé with être vs avoir.',
    folderId: 'language',
  },
]

const seedPlanItems: PlanItem[] = [
  { id: 'plan-1', day: 'Mon', title: 'Cell membranes', minutes: 45, done: true },
  { id: 'plan-2', day: 'Tue', title: 'Enzyme kinetics', minutes: 50, done: true },
  { id: 'plan-3', day: 'Wed', title: 'AI tutor quiz: metabolism', minutes: 30, done: false },
  { id: 'plan-4', day: 'Thu', title: 'Smart notes review', minutes: 25, done: false },
  { id: 'plan-5', day: 'Fri', title: 'Practice FRQs', minutes: 60, done: false },
]

function titleFromBody(text: string) {
  const line = text.trim().split('\n')[0] ?? 'Untitled note'
  return line.slice(0, 48) || 'Untitled note'
}

function typeFromFileName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'Slides'
  if (['pdf'].includes(ext)) return 'Reading'
  if (['doc', 'docx', 'pages', 'txt', 'md'].includes(ext)) return 'Lecture notes'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Handout'
  return 'Other'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function App() {
  const [view, setView] = useState<View>('tutor')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'ai',
      text: 'Hi — I’m your tutor. This screen is UI-only for now: no tutoring API is wired up.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [capture, setCapture] = useState('')
  const [captureStatus, setCaptureStatus] = useState('')
  const [folders, setFolders] = useState<Folder[]>(seedFolders)
  const [notes, setNotes] = useState<Note[]>(seedNotes)
  const [query, setQuery] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [activeFolder, setActiveFolder] = useState(ALL)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [moveTarget, setMoveTarget] = useState(INBOX)
  const [materialFolders, setMaterialFolders] = useState<Folder[]>(seedMaterialFolders)
  const [materials, setMaterials] = useState<Material[]>(seedMaterials)
  const [planItems, setPlanItems] = useState<PlanItem[]>(seedPlanItems)
  const [materialFolder, setMaterialFolder] = useState(ALL)
  const [materialFolderName, setMaterialFolderName] = useState('')
  const [showMaterialFolderForm, setShowMaterialFolderForm] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tutorName, setTutorName] = useState<string>(() => localStorage.getItem('tutor-name') ?? 'Tutor')
  const [model, setModel] = useState<string>(() => localStorage.getItem('tutor-model') ?? modelOptions[0])
  const [showSettings, setShowSettings] = useState(false)
  const [nameDraft, setNameDraft] = useState(tutorName)
  const [modelDraft, setModelDraft] = useState(model)
  const [showTranslation, setShowTranslation] = useState<boolean>(
    () => localStorage.getItem('tutor-translate') === 'on',
  )
  const [targetLanguage, setTargetLanguage] = useState<string>(
    () => localStorage.getItem('tutor-lang') ?? 'es',
  )

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((n) => {
      const inFolder = activeFolder === ALL || n.folderId === activeFolder
      if (!inFolder) return false
      if (!q) return true
      const folder = folders.find((f) => f.id === n.folderId)?.name ?? ''
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        folder.toLowerCase().includes(q)
      )
    })
  }, [notes, query, activeFolder, folders])

  const editingNote = notes.find((n) => n.id === editingId) ?? null
  const selectedCount = selectedIds.length
  const languageLabel = languages.find((l) => l.value === targetLanguage)?.label ?? ''
  const doneCount = planItems.filter((p) => p.done).length
  const visibleMaterials =
    materialFolder === ALL ? materials : materials.filter((m) => m.folderId === materialFolder)

  function sendTutor(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: Date.now(), role: 'you', text }])
    setDraft('')
  }

  function addNoteToFolder(title: string, body: string, folderId = INBOX) {
    const note: Note = {
      id: Date.now(),
      title: title.trim() || 'Untitled note',
      body,
      folderId: folders.some((f) => f.id === folderId) ? folderId : INBOX,
    }
    setNotes((prev) => [note, ...prev])
    return note
  }

  function addNote(event: FormEvent) {
    event.preventDefault()
    const title = noteTitle.trim()
    if (!title) return
    const folderId = activeFolder === ALL ? INBOX : activeFolder
    addNoteToFolder(title, '', folderId)
    setNoteTitle('')
    setShowNoteForm(false)
  }

  function addFromTutor(event: FormEvent) {
    event.preventDefault()
    const text = capture.trim()
    if (!text) return
    addNoteToFolder(titleFromBody(text), text, INBOX)
    setCapture('')
    setCaptureStatus('Saved to Smart Notes → Inbox')
    window.setTimeout(() => setCaptureStatus(''), 2500)
  }

  function createFolder(event: FormEvent) {
    event.preventDefault()
    const name = folderName.trim()
    if (!name) return
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    setFolders((prev) => [...prev, { id, name }])
    setFolderName('')
    setActiveFolder(id)
    setShowFolderForm(false)
  }

  function deleteNote(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setSelectedIds((prev) => prev.filter((n) => n !== id))
    if (editingId === id) setEditingId(null)
  }

  function deleteSelected() {
    if (selectedCount === 0) return
    setNotes((prev) => prev.filter((n) => !selectedIds.includes(n.id)))
    if (editingId && selectedIds.includes(editingId)) setEditingId(null)
    setSelectedIds([])
  }

  function moveSelected() {
    if (selectedCount === 0) return
    setNotes((prev) =>
      prev.map((n) => (selectedIds.includes(n.id) ? { ...n, folderId: moveTarget } : n)),
    )
    setSelectedIds([])
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    const ids = visibleNotes.map((n) => n.id)
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.includes(id))
    setSelectedIds(allOn ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])])
  }

  function updateNote(id: number, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  function openSettings() {
    setNameDraft(tutorName)
    setModelDraft(model)
    setShowSettings(true)
  }

  function saveTutorName(event: FormEvent) {
    event.preventDefault()
    const next = nameDraft.trim() || 'Tutor'
    setTutorName(next)
    localStorage.setItem('tutor-name', next)
    setNameDraft(next)
    setModel(modelDraft)
    localStorage.setItem('tutor-model', modelDraft)
    setShowSettings(false)
  }

  function toggleTranslation() {
    setShowTranslation((prev) => {
      const next = !prev
      localStorage.setItem('tutor-translate', next ? 'on' : 'off')
      return next
    })
  }

  function updateLanguage(lang: string) {
    setTargetLanguage(lang)
    localStorage.setItem('tutor-lang', lang)
  }

  function renderChat(translated: boolean) {
    return messages.map((m) => (
      <article
        key={`${translated ? 'translated' : 'original'}-${m.id}`}
        className={`bubble ${m.role}${translated ? ' translated' : ''}`}
      >
        <span>{m.role === 'ai' ? tutorName : 'You'}</span>
        <p>{translated ? simulateTranslation(m.text, targetLanguage) : m.text}</p>
      </article>
    ))
  }

  function deleteMaterial(id: number) {
    setMaterials((prev) => prev.filter((m) => m.id !== id))
  }

  function createMaterialFolder(event: FormEvent) {
    event.preventDefault()
    const name = materialFolderName.trim()
    if (!name) return
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    setMaterialFolders((prev) => [...prev, { id, name }])
    setMaterialFolderName('')
    setMaterialFolder(id)
    setShowMaterialFolderForm(false)
  }

  function handleFiles(files: FileList | File[]) {
    const folderId = materialFolder === ALL ? INBOX : materialFolder
    const newMaterials: Material[] = Array.from(files).map((file) => ({
      id: Date.now() + Math.round(Math.random() * 1000),
      name: file.name,
      type: typeFromFileName(file.name),
      folderId,
      addedAt: new Date().toISOString(),
      isStudyMaterial: false,
    }))
    setMaterials((prev) => [...newMaterials, ...prev])
    setShowUpload(false)
  }

  function toggleStudyMaterial(material: Material) {
    if (material.isStudyMaterial) {
      setMaterials((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, isStudyMaterial: false } : m)),
      )
      setPlanItems((prev) => prev.filter((p) => p.materialId !== material.id))
    } else {
      setMaterials((prev) =>
        prev.map((m) => (m.id === material.id ? { ...m, isStudyMaterial: true } : m)),
      )
      const day = new Date(material.addedAt).toLocaleDateString(undefined, { weekday: 'short' })
      const item: PlanItem = {
        id: `plan-${material.id}`,
        day,
        title: material.name,
        minutes: 30,
        done: false,
        materialId: material.id,
      }
      setPlanItems((prev) => [item, ...prev])
    }
  }

  function MaterialUploadModal() {
    return (
      <div className="modal-backdrop" role="presentation" onClick={() => setShowUpload(false)}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Upload files"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h2>Add files</h2>
            <button
              className="modal-close"
              type="button"
              aria-label="Close"
              onClick={() => setShowUpload(false)}
            >
              ×
            </button>
          </div>
          <div
            className={`dropzone${dragActive ? ' active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <p className="dropzone-icon" aria-hidden>
              ⬆
            </p>
            <p>Drag & drop files here, or</p>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Select files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFiles(e.target.files)
                }
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files)
    }
  }

  function materialFolderNameFor(id: string) {
    return materialFolders.find((f) => f.id === id)?.name ?? 'Inbox'
  }

  function folderNameFor(id: string) {
    return folders.find((f) => f.id === id)?.name ?? 'Inbox'
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">L</span>
          <div>
            <strong>Lumen</strong>
            <p>Study workspace</p>
          </div>
        </div>

        <nav className="nav" aria-label="Workspace">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span>
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="streak">
            <p>Focus streak</p>
            <strong>6 days</strong>
          </div>

          <div className="settings-wrap">
            <button
              className="settings-btn settings-btn-sidebar"
              type="button"
              onClick={openSettings}
              aria-label="Tutor settings"
              aria-expanded={showSettings}
            >
              <span aria-hidden>⚙</span>
              Settings
            </button>
            {showSettings && (
              <form className="settings-pop" onSubmit={saveTutorName}>
                <label htmlFor="tutor-name">Tutor name</label>
                <input
                  id="tutor-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Tutor"
                />
                <label htmlFor="tutor-model">Model</label>
                <select
                  id="tutor-model"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                >
                  {modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <div className="settings-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setShowSettings(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="submit">
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        {view === 'tutor' && (
          <section className="panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">AI Tutor</p>
                <h1>Ask anything you’re studying</h1>
              </div>
              <p className="stat">
                {model}
                <span>Active tutor model</span>
              </p>
            </header>
            <div className="tutor-tools">
              <button
                className={`toggle${showTranslation ? ' on' : ''}`}
                type="button"
                role="switch"
                aria-checked={showTranslation}
                onClick={toggleTranslation}
              >
                <span className="toggle-track" aria-hidden>
                  <span className="toggle-thumb" />
                </span>
                Translate
              </button>
              {showTranslation && (
                <select
                  value={targetLanguage}
                  onChange={(e) => updateLanguage(e.target.value)}
                  aria-label="Translation language"
                >
                  {languages.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className={`chat-layout${showTranslation ? ' split' : ''}`}>
              <div className="chat-col">
                {showTranslation && <p className="chat-col-label">Original</p>}
                <div className="chat" aria-live="polite">
                  {renderChat(false)}
                </div>
              </div>
              {showTranslation && (
                <div className="chat-col">
                  <p className="chat-col-label">{languageLabel} translation</p>
                  <div className="chat" aria-live="polite">
                    {renderChat(true)}
                  </div>
                </div>
              )}
            </div>
            <form className="composer" onSubmit={sendTutor}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Explain osmosis like I’m in AP Bio…"
                aria-label="Message the tutor"
              />
              <button className="btn btn-primary" type="submit">
                Send
              </button>
            </form>
            <div className="capture-fab-wrap">
              <button
                className={`capture-fab${showCapture ? ' open' : ''}`}
                type="button"
                aria-expanded={showCapture}
                onClick={() => setShowCapture((prev) => !prev)}
              >
                <span aria-hidden>✎</span>
                Save to Smart Notes
              </button>
              {showCapture && (
                <form className="capture capture-pop" onSubmit={addFromTutor}>
                  <div className="capture-head">
                    <label htmlFor="capture">Save a clip to Smart Notes</label>
                    <button
                      className="modal-close"
                      type="button"
                      aria-label="Close"
                      onClick={() => setShowCapture(false)}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    id="capture"
                    value={capture}
                    onChange={(e) => setCapture(e.target.value)}
                    placeholder="Paste or write something worth keeping…"
                    rows={4}
                  />
                  <div className="capture-row">
                    <button className="btn btn-primary" type="submit">
                      Add to smart notes
                    </button>
                    {captureStatus && <p className="status">{captureStatus}</p>}
                  </div>
                </form>
              )}
            </div>
          </section>
        )}

        {view === 'plan' && (
          <section className="panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Study Plan</p>
                <h1>This week, in order</h1>
              </div>
              <p className="stat">
                {doneCount} of {planItems.length} sessions done
                <span>Keep Wednesday light if the quiz feels shaky.</span>
              </p>
            </header>
            <ol className="plan">
              {planItems.map((item) => (
                <li key={item.id} className={item.done ? 'done' : undefined}>
                  <span className="day">{item.day}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.minutes} min</p>
                  </div>
                  <em>{item.done ? 'Done' : 'Up next'}</em>
                </li>
              ))}
              {planItems.length === 0 && <p className="empty">No study sessions planned yet.</p>}
            </ol>
          </section>
        )}

        {view === 'files' && (
          <section className="panel files-panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Files</p>
                <h1>Materials, in one place</h1>
              </div>
            </header>

            <div className="files-workspace">
              <aside className="folders" aria-label="Material folders">
                <p className="rail-label">Folders</p>
                <button
                  type="button"
                  className={materialFolder === ALL ? 'folder active' : 'folder'}
                  onClick={() => setMaterialFolder(ALL)}
                >
                  All files
                </button>
                {materialFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className={materialFolder === folder.id ? 'folder active' : 'folder'}
                    onClick={() => setMaterialFolder(folder.id)}
                  >
                    {folder.name}
                    <em>{materials.filter((m) => m.folderId === folder.id).length}</em>
                  </button>
                ))}
                {showMaterialFolderForm ? (
                  <form className="folder-create" onSubmit={createMaterialFolder}>
                    <input
                      value={materialFolderName}
                      onChange={(e) => setMaterialFolderName(e.target.value)}
                      placeholder="New folder name"
                      aria-label="New material folder name"
                    />
                    <button className="btn btn-primary" type="submit">
                      Create folder
                    </button>
                  </form>
                ) : (
                  <button
                    className="btn btn-ghost folder-toggle"
                    type="button"
                    onClick={() => setShowMaterialFolderForm(true)}
                  >
                    Add new folder
                  </button>
                )}
              </aside>

              <div className="materials-main">
                <div className="materials-toolbar">
                  <button className="btn btn-primary" type="button" onClick={() => setShowUpload(true)}>
                    Add file
                  </button>
                </div>

                <div className="materials">
                  {visibleMaterials.map((material) => (
                    <article key={material.id} className="material">
                      <div className="material-top">
                        <span>{material.type}</span>
                        <button
                          className="icon-btn"
                          type="button"
                          aria-label={`Delete ${material.name}`}
                          onClick={() => deleteMaterial(material.id)}
                        >
                          Delete
                        </button>
                      </div>
                      <h2>{material.name}</h2>
                      <p>{materialFolderNameFor(material.folderId)}</p>
                      <p className="material-meta">Added {formatDate(material.addedAt)}</p>
                      <button
                        className={`btn material-study-toggle ${material.isStudyMaterial ? 'study-on' : 'btn-ghost'}`}
                        type="button"
                        onClick={() => toggleStudyMaterial(material)}
                      >
                        {material.isStudyMaterial ? 'In study plan' : 'Add to study plan'}
                      </button>
                    </article>
                  ))}
                  {visibleMaterials.length === 0 && <p className="empty">No files in this folder.</p>}
                </div>
              </div>
            </div>
            {showUpload && <MaterialUploadModal />}
          </section>
        )}

        {view === 'notes' && (
          <section className="panel notes-panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Smart Notes</p>
                <h1>{editingNote ? 'Editor' : 'Ideas you can find again'}</h1>
              </div>
            </header>

            {editingNote ? (
              <div className="editor">
                <div className="editor-toolbar">
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>
                    Back to notes
                  </button>
                  <label className="folder-pick">
                    Folder
                    <select
                      value={editingNote.folderId}
                      onChange={(e) => updateNote(editingNote.id, { folderId: e.target.value })}
                      aria-label="Note folder"
                    >
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-danger" type="button" onClick={() => deleteNote(editingNote.id)}>
                    Delete
                  </button>
                </div>
                <input
                  className="editor-title"
                  value={editingNote.title}
                  onChange={(e) => updateNote(editingNote.id, { title: e.target.value })}
                  aria-label="Note title"
                />
                <textarea
                  className="editor-body"
                  value={editingNote.body}
                  onChange={(e) => updateNote(editingNote.id, { body: e.target.value })}
                  placeholder="Write the note…"
                  aria-label="Note text"
                />
              </div>
            ) : (
              <div className="notes-workspace">
                <aside className="folders" aria-label="Folders">
                  <p className="rail-label">Folders</p>
                  <button
                    type="button"
                    className={activeFolder === ALL ? 'folder active' : 'folder'}
                    onClick={() => setActiveFolder(ALL)}
                  >
                    All notes
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      className={activeFolder === folder.id ? 'folder active' : 'folder'}
                      onClick={() => setActiveFolder(folder.id)}
                    >
                      {folder.name}
                      <em>{notes.filter((n) => n.folderId === folder.id).length}</em>
                    </button>
                  ))}
                  {showFolderForm ? (
                    <form className="folder-create" onSubmit={createFolder}>
                      <input
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder="New folder name"
                        aria-label="New folder name"
                      />
                      <button className="btn btn-primary" type="submit">
                        Create folder
                      </button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-ghost folder-toggle"
                      type="button"
                      onClick={() => setShowFolderForm(true)}
                  >
                    Add new folder
                  </button>
                )}
                </aside>

                <div className="notes-main">
                  <div className="note-tools">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search notes"
                      aria-label="Search notes"
                    />
                    {showNoteForm ? (
                      <form onSubmit={addNote}>
                        <input
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          placeholder="New note title"
                          aria-label="New note title"
                        />
                        <button className="btn btn-primary" type="submit">
                          Add
                        </button>
                      </form>
                    ) : (
                      <button
                        className="btn btn-ghost note-add-toggle"
                        type="button"
                        onClick={() => setShowNoteForm(true)}
                      >
                        Add new note
                      </button>
                    )}
                  </div>

                  <div className="bulk-bar">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={visibleNotes.length > 0 && visibleNotes.every((n) => selectedIds.includes(n.id))}
                        onChange={toggleSelectAll}
                      />
                      Select all
                    </label>
                    <span>
                      {selectedCount} selected
                    </span>
                    <select
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      aria-label="Move selected notes to folder"
                      disabled={selectedCount === 0}
                    >
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={selectedCount === 0}
                      onClick={moveSelected}
                    >
                      Move to folder
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={selectedCount === 0}
                      onClick={deleteSelected}
                    >
                      Delete selected
                    </button>
                  </div>

                  <div className="notes">
                    {visibleNotes.map((note) => (
                      <article key={note.id} className={selectedIds.includes(note.id) ? 'note selected' : 'note'}>
                        <div className="note-top">
                          <label className="check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(note.id)}
                              onChange={() => toggleSelected(note.id)}
                              aria-label={`Select ${note.title}`}
                            />
                          </label>
                          <span>{folderNameFor(note.folderId)}</span>
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`Delete ${note.title}`}
                            onClick={() => deleteNote(note.id)}
                          >
                            Delete
                          </button>
                        </div>
                        <button className="note-open" type="button" onClick={() => setEditingId(note.id)}>
                          <h2>{note.title || 'Untitled note'}</h2>
                          <p>{note.body || 'Empty note — open to write.'}</p>
                        </button>
                      </article>
                    ))}
                    {visibleNotes.length === 0 && <p className="empty">No notes in this folder.</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
