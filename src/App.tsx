import {
  FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import './App.css'
import {
  deleteFileBlob,
  loadFileBlob,
  loadJSON,
  saveFileBlob,
  saveJSON,
} from './persistence'

const PdfPreview = lazy(() => import('./PdfPreview'))

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
  lastReviewed?: string
  file?: File
}
type PlanItem = {
  id: string
  day: string
  title: string
  minutes: number
  done: boolean
  materialId?: number
  date?: string
  kind?: 'study' | 'quiz'
}

const INBOX = 'inbox'
const ALL = 'all'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:5001'

const DEFAULT_QUIZ_FREQUENCY_DAYS = 3

const NOTES_STORE_KEY = 'lumen-notes'
const FOLDERS_STORE_KEY = 'lumen-folders'
const MATERIAL_FOLDERS_STORE_KEY = 'lumen-material-folders'
const MATERIALS_STORE_KEY = 'lumen-materials'
const PLAN_STORE_KEY = 'lumen-plan'
const COMPLETED_QUIZ_DATES_KEY = 'lumen-completed-quiz-dates'

type PersistedMaterial = Omit<Material, 'file'>

const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'ppt',
  'pptx',
  'key',
  'doc',
  'docx',
  'pages',
  'txt',
  'md',
  'rtf',
  'csv',
  'xls',
  'xlsx',
  'odt',
  'ods',
  'odp',
  'html',
  'htm',
  'epub',
]

const ALLOWED_FILE_TYPES = ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`)

const TEXT_PREVIEW_EXTENSIONS = new Set(['txt', 'md', 'csv', 'rtf'])

const WEEKDAY_ORDER: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

const navItems: { id: View; label: string; hint: string; icon: string }[] = [
  { id: 'tutor', label: 'AI Tutor', hint: 'Ask, quiz, explain', icon: '✦' },
  { id: 'plan', label: 'Study Plan', hint: 'This week’s path', icon: '▣' },
  { id: 'notes', label: 'Smart Notes', hint: 'Capture & connect', icon: '✎' },
  { id: 'files', label: 'Files', hint: 'Upload & organize', icon: '▤' },
]

const modelOptions = ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro', 'Llama 3.1 70B']

const seedMaterialFolders: Folder[] = [{ id: INBOX, name: 'Inbox' }]

const seedMaterials: Material[] = []

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

const seedFolders: Folder[] = [{ id: INBOX, name: 'Inbox' }]

const seedNotes: Note[] = []

const seedPlanItems: PlanItem[] = []

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

function isAllowedFile(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_FILE_EXTENSIONS.includes(ext)
}

function previewKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_PREVIEW_EXTENSIONS.has(ext) ? 'text' : 'embed'
}

function toDateInputValue(iso: string) {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPlanDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatIsoDate(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function computeStreak(dates: string[]): number {
  const completed = new Set(dates)
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  const has = (d: Date) => completed.has(formatIsoDate(d))

  // If today isn't done yet, a streak stays alive through yesterday.
  if (!has(cursor)) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (has(cursor)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function formatRelative(iso: string) {
  const then = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(then)) / 86400000)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return `on ${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function formatWeekRange(start: Date, end: Date) {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function makeQuizItemForMaterial(material: Material, due: Date = new Date()): PlanItem {
  const d = new Date(due)
  d.setHours(12, 0, 0, 0)
  return {
    id: `quiz-${material.id}-${d.getTime()}`,
    day: d.toLocaleDateString(undefined, { weekday: 'short' }),
    title: `Quiz: ${material.name}`,
    minutes: 20,
    done: false,
    materialId: material.id,
    date: formatIsoDate(d),
    kind: 'quiz',
  }
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
  const [noteIntegrationStatus, setNoteIntegrationStatus] = useState('')
  const [folders, setFolders] = useState<Folder[]>(() => loadJSON(FOLDERS_STORE_KEY, seedFolders))
  const [notes, setNotes] = useState<Note[]>(() => loadJSON(NOTES_STORE_KEY, seedNotes))
  const [query, setQuery] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [activeFolder, setActiveFolder] = useState(ALL)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [moveTarget, setMoveTarget] = useState(INBOX)
  const [materialFolders, setMaterialFolders] = useState<Folder[]>(() =>
    loadJSON(MATERIAL_FOLDERS_STORE_KEY, seedMaterialFolders),
  )
  const [materials, setMaterials] = useState<Material[]>(seedMaterials)
  const [materialsHydrated, setMaterialsHydrated] = useState(false)
  const [planItems, setPlanItems] = useState<PlanItem[]>(() => loadJSON(PLAN_STORE_KEY, seedPlanItems))
  const [completedQuizDates, setCompletedQuizDates] = useState<string[]>(() =>
    loadJSON(COMPLETED_QUIZ_DATES_KEY, [] as string[]),
  )
  const [materialFolder, setMaterialFolder] = useState(ALL)
  const [materialFolderName, setMaterialFolderName] = useState('')
  const [showMaterialFolderForm, setShowMaterialFolderForm] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const [materialQuery, setMaterialQuery] = useState('')
  const [draggedNoteId, setDraggedNoteId] = useState<number | null>(null)
  const [draggedMaterialId, setDraggedMaterialId] = useState<number | null>(null)
  const [noteDropFolder, setNoteDropFolder] = useState<string | null>(null)
  const [materialDropFolder, setMaterialDropFolder] = useState<string | null>(null)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([])
  const [materialMoveTarget, setMaterialMoveTarget] = useState(INBOX)
  const [materialMenuId, setMaterialMenuId] = useState<number | null>(null)
  const [uploadDate, setUploadDate] = useState('')
  const [editingDateId, setEditingDateId] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [viewingMaterial, setViewingMaterial] = useState<Material | null>(null)
  const [viewText, setViewText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tutorName, setTutorName] = useState<string>(() => localStorage.getItem('tutor-name') ?? 'Tutor')
  const [model] = useState<string>(() => localStorage.getItem('tutor-model') ?? modelOptions[0])
  const [quizFrequencyDays, setQuizFrequencyDays] = useState<number>(() => {
    const stored = Number(localStorage.getItem('tutor-quiz-frequency') ?? DEFAULT_QUIZ_FREQUENCY_DAYS)
    return Number.isFinite(stored) && stored >= 1
      ? Math.round(stored)
      : DEFAULT_QUIZ_FREQUENCY_DAYS
  })
  const [showSettings, setShowSettings] = useState(false)
  const [nameDraft, setNameDraft] = useState(tutorName)
  const [frequencyDraft, setFrequencyDraft] = useState(quizFrequencyDays)
  const [bedrockRegion, setBedrockRegion] = useState<string>(
    () => localStorage.getItem('bedrock-region') ?? 'us-west-2',
  )
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState<string>('')
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState<string>('')
  const [bedrockSessionToken, setBedrockSessionToken] = useState<string>('')
  const [bedrockModelId, setBedrockModelId] = useState<string>(
    () => localStorage.getItem('bedrock-model-id') ?? '',
  )
  const [bedrockRegionDraft, setBedrockRegionDraft] = useState(bedrockRegion)
  const [bedrockAccessKeyIdDraft, setBedrockAccessKeyIdDraft] = useState(bedrockAccessKeyId)
  const [bedrockSecretAccessKeyDraft, setBedrockSecretAccessKeyDraft] = useState(bedrockSecretAccessKey)
  const [bedrockSessionTokenDraft, setBedrockSessionTokenDraft] = useState(bedrockSessionToken)
  const [bedrockModelIdDraft, setBedrockModelIdDraft] = useState(bedrockModelId)
  const [showTranslation, setShowTranslation] = useState<boolean>(
    () => localStorage.getItem('tutor-translate') === 'on',
  )
  const [targetLanguage, setTargetLanguage] = useState<string>(
    () => localStorage.getItem('tutor-lang') ?? 'es',
  )

  // Credentials are not persisted; clear any legacy copies stored by older versions.
  useEffect(() => {
    localStorage.removeItem('bedrock-access-key-id')
    localStorage.removeItem('bedrock-secret-access-key')
    localStorage.removeItem('bedrock-session-token')
  }, [])

  // Hydrate persisted file blobs into material metadata.
  useEffect(() => {
    let cancelled = false
    const stored = loadJSON<PersistedMaterial[]>(MATERIALS_STORE_KEY, [] as PersistedMaterial[])
    Promise.all(
      stored.map(async (m) => ({
        ...m,
        file: (await loadFileBlob(m.id)) ?? undefined,
      })),
    ).then((hydrated) => {
      if (cancelled) return
      setMaterials(hydrated)
      setMaterialsHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveJSON(FOLDERS_STORE_KEY, folders)
  }, [folders])

  useEffect(() => {
    saveJSON(NOTES_STORE_KEY, notes)
  }, [notes])

  useEffect(() => {
    saveJSON(MATERIAL_FOLDERS_STORE_KEY, materialFolders)
  }, [materialFolders])

  useEffect(() => {
    saveJSON(PLAN_STORE_KEY, planItems)
  }, [planItems])

  useEffect(() => {
    saveJSON(COMPLETED_QUIZ_DATES_KEY, completedQuizDates)
  }, [completedQuizDates])

  useEffect(() => {
    if (!materialsHydrated) return
    const metadata: PersistedMaterial[] = materials.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      folderId: m.folderId,
      addedAt: m.addedAt,
      isStudyMaterial: m.isStudyMaterial,
      lastReviewed: m.lastReviewed,
    }))
    saveJSON(MATERIALS_STORE_KEY, metadata)
  }, [materials, materialsHydrated])

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
  const selectedMaterialCount = selectedMaterialIds.length
  const languageLabel = languages.find((l) => l.value === targetLanguage)?.label ?? ''
  const visibleMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase()
    return materials
      .filter((m) => materialFolder === ALL || m.folderId === materialFolder)
      .filter((m) => {
        if (!q) return true
        const folder = materialFolders.find((f) => f.id === m.folderId)?.name ?? ''
        return (
          m.name.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q) ||
          folder.toLowerCase().includes(q)
        )
      })
  }, [materials, materialFolder, materialQuery, materialFolders])

  const weekRange = useMemo(() => {
    const now = new Date()
    const day = now.getDay()
    const diffToMonday = (day + 6) % 7
    const start = new Date(now)
    start.setDate(now.getDate() - diffToMonday)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [])

  const visiblePlanItems = useMemo(() => {
    return [...planItems]
      .filter((item) => {
        if (!item.date) return true
        const d = new Date(`${item.date}T12:00:00`)
        return d >= weekRange.start && d <= weekRange.end
      })
      .sort((a, b) => {
        const aOrder = WEEKDAY_ORDER[a.day] ?? 7
        const bOrder = WEEKDAY_ORDER[b.day] ?? 7
        if (aOrder !== bOrder) return aOrder - bOrder
        if (a.date && b.date) return a.date.localeCompare(b.date)
        return 0
      })
  }, [planItems, weekRange])

  const doneCount = visiblePlanItems.filter((p) => p.done).length

  const focusStreak = useMemo(() => computeStreak(completedQuizDates), [completedQuizDates])

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

    setCaptureStatus('Formatting clip with Amazon Bedrock…')

    fetch(`${BACKEND_URL}/api/bedrock/integrate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        existingNotes: notes,
        folders,
        modelId: bedrockModelId.trim() || undefined,
      }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.error || `Request failed (${response.status})`)
        }
        return data as { targetTitle?: string; body?: string }
      })
      .then((data) => {
        const body = String(data.body ?? '').trim()
        if (!body) throw new Error('The model returned an empty note.')
        const targetTitle = String(data.targetTitle ?? '').trim()
        const targetKey = targetTitle.toLowerCase()

        setNotes((prev) => {
          const existing = prev.find((n) => n.title.trim().toLowerCase() === targetKey)
          if (existing) {
            return prev.map((n) => (n.id === existing.id ? { ...n, body } : n))
          }
          const title = targetTitle || titleFromBody(text)
          return [{ id: Date.now(), title, body, folderId: INBOX }, ...prev]
        })

        setCapture('')
        setCaptureStatus(`Saved to Smart Notes → ${targetTitle || titleFromBody(text)}`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        setCaptureStatus(`Could not save clip: ${message}`)
      })
      .finally(() => {
        window.setTimeout(() => setCaptureStatus(''), 8000)
      })
  }

  function integrateMaterialToNotes(material: Material) {
    if (!material.file) return

    const file = material.file
    setNoteIntegrationStatus(`Formatting "${material.name}" into Smart Notes…`)

    const form = new FormData()
    form.append('file', file)
    form.append('existingNotesJson', JSON.stringify(notes))
    form.append('foldersJson', JSON.stringify(folders))
    if (bedrockModelId.trim()) form.append('modelId', bedrockModelId.trim())

    fetch(`${BACKEND_URL}/api/bedrock/integrate-notes`, { method: 'POST', body: form })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.error || `Request failed (${response.status})`)
        }
        return data as { targetTitle?: string; body?: string }
      })
      .then((data) => {
        const body = String(data.body ?? '').trim()
        if (!body) throw new Error('The model returned an empty note.')
        const targetTitle = String(data.targetTitle ?? '').trim()
        const targetKey = targetTitle.toLowerCase()

        setNotes((prev) => {
          const existing = prev.find((n) => n.title.trim().toLowerCase() === targetKey)
          if (existing) {
            return prev.map((n) => (n.id === existing.id ? { ...n, body } : n))
          }
          const title = targetTitle || 'Imported notes'
          return [{ id: Date.now(), title, body, folderId: INBOX }, ...prev]
        })

        setNoteIntegrationStatus(`Added formatted notes for "${material.name}" to Smart Notes.`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        setNoteIntegrationStatus(`Could not integrate "${material.name}": ${message}`)
      })
      .finally(() => {
        window.setTimeout(() => setNoteIntegrationStatus(''), 8000)
      })
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
    setFrequencyDraft(quizFrequencyDays)
    setBedrockRegionDraft(bedrockRegion)
    setBedrockAccessKeyIdDraft(bedrockAccessKeyId)
    setBedrockSecretAccessKeyDraft(bedrockSecretAccessKey)
    setBedrockSessionTokenDraft(bedrockSessionToken)
    setBedrockModelIdDraft(bedrockModelId)
    setShowSettings(true)
  }

  function saveTutorName(event: FormEvent) {
    event.preventDefault()
    const next = nameDraft.trim() || 'Tutor'
    setTutorName(next)
    localStorage.setItem('tutor-name', next)
    setNameDraft(next)
    const freq =
      Number.isFinite(frequencyDraft) && frequencyDraft >= 1
        ? Math.round(frequencyDraft)
        : DEFAULT_QUIZ_FREQUENCY_DAYS
    setQuizFrequencyDays(freq)
    localStorage.setItem('tutor-quiz-frequency', String(freq))
    setFrequencyDraft(freq)

    const nextRegion = bedrockRegionDraft.trim() || 'us-west-2'
    setBedrockRegion(nextRegion)
    localStorage.setItem('bedrock-region', nextRegion)
    setBedrockRegionDraft(nextRegion)

    // AWS credentials stay in memory only; they are never written to browser storage.
    setBedrockAccessKeyId(bedrockAccessKeyIdDraft)
    setBedrockSecretAccessKey(bedrockSecretAccessKeyDraft)
    setBedrockSessionToken(bedrockSessionTokenDraft)
    setBedrockModelId(bedrockModelIdDraft)
    localStorage.setItem('bedrock-model-id', bedrockModelIdDraft)

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
    void deleteFileBlob(id)
    setMaterials((prev) => prev.filter((m) => m.id !== id))
    setSelectedMaterialIds((prev) => prev.filter((n) => n !== id))
    setMaterialMenuId(null)
  }

  function updateMaterialDate(id: number, value: string) {
    if (!value) return
    const iso = new Date(`${value}T12:00:00`).toISOString()
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, addedAt: iso } : m)))
  }

  function toggleMaterialSelected(id: number) {
    setSelectedMaterialIds((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]))
  }

  function toggleMaterialSelectAll() {
    const ids = visibleMaterials.map((m) => m.id)
    const allOn = ids.length > 0 && ids.every((id) => selectedMaterialIds.includes(id))
    setSelectedMaterialIds(
      allOn
        ? selectedMaterialIds.filter((id) => !ids.includes(id))
        : [...new Set([...selectedMaterialIds, ...ids])],
    )
  }

  function deleteSelectedMaterials() {
    selectedMaterialIds.forEach((id) => void deleteFileBlob(id))
    setMaterials((prev) => prev.filter((m) => !selectedMaterialIds.includes(m.id)))
    setSelectedMaterialIds([])
  }

  function moveSelectedMaterials() {
    setMaterials((prev) =>
      prev.map((m) =>
        selectedMaterialIds.includes(m.id) ? { ...m, folderId: materialMoveTarget } : m,
      ),
    )
    setSelectedMaterialIds([])
  }

  function addSelectedMaterialsToStudyPlan() {
    const targets = materials.filter(
      (m) => selectedMaterialIds.includes(m.id) && !m.isStudyMaterial,
    )
    if (targets.length > 0) {
      setMaterials((prev) =>
        prev.map((m) => (selectedMaterialIds.includes(m.id) ? { ...m, isStudyMaterial: true } : m)),
      )
      targets.forEach((material) => void integrateMaterialToNotes(material))
      const newItems: PlanItem[] = targets.flatMap((material) => {
        const day = new Date(material.addedAt).toLocaleDateString(undefined, { weekday: 'short' })
        const review: PlanItem = {
          id: `plan-${material.id}`,
          day,
          title: material.name,
          minutes: 30,
          done: false,
          materialId: material.id,
          kind: 'study',
        }
        return [review, makeQuizItemForMaterial(material)]
      })
      setPlanItems((prev) => [...newItems, ...prev])
    }
    setSelectedMaterialIds([])
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
    const allowed: File[] = []
    const rejected: string[] = []
    Array.from(files).forEach((file) => {
      if (isAllowedFile(file.name)) allowed.push(file)
      else rejected.push(file.name)
    })

    const addedAt = uploadDate
      ? new Date(`${uploadDate}T12:00:00`).toISOString()
      : new Date().toISOString()

    if (allowed.length > 0) {
      const newMaterials: Material[] = allowed.map((file) => ({
        id: Date.now() + Math.round(Math.random() * 1000),
        name: file.name,
        type: typeFromFileName(file.name),
        folderId,
        addedAt,
        isStudyMaterial: false,
        file,
      }))
      setMaterials((prev) => [...newMaterials, ...prev])
      newMaterials.forEach((material) => {
        if (material.file) void saveFileBlob(material.id, material.file)
      })
      setUploadDate('')
    }

    if (rejected.length > 0) {
      setUploadError(`Skipped unsupported file(s): ${rejected.join(', ')}`)
    } else {
      setUploadError('')
      setShowUpload(false)
    }
  }

  function clearDragImage(event: DragEvent) {
    const img = new Image()
    img.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    event.dataTransfer.setDragImage(img, 0, 0)
  }

  function dropOnFolder(event: DragEvent, folderId: string, kind: 'note' | 'material') {
    event.preventDefault()
    if (kind === 'note') {
      if (draggedNoteId == null) return
      setNotes((prev) => prev.map((n) => (n.id === draggedNoteId ? { ...n, folderId } : n)))
      setDraggedNoteId(null)
      setNoteDropFolder(null)
    } else {
      if (draggedMaterialId == null) return
      setMaterials((prev) => prev.map((m) => (m.id === draggedMaterialId ? { ...m, folderId } : m)))
      setDraggedMaterialId(null)
      setMaterialDropFolder(null)
    }
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
      void integrateMaterialToNotes(material)
      const day = new Date(material.addedAt).toLocaleDateString(undefined, { weekday: 'short' })
      const review: PlanItem = {
        id: `plan-${material.id}`,
        day,
        title: material.name,
        minutes: 30,
        done: false,
        materialId: material.id,
        kind: 'study',
      }
      setPlanItems((prev) => [review, makeQuizItemForMaterial(material), ...prev])
    }
  }

  function completePlanItem(item: PlanItem) {
    if (item.kind === 'quiz' && item.materialId != null) {
      const now = new Date()
      const completedDate = formatIsoDate(now)
      setCompletedQuizDates((prev) =>
        prev.includes(completedDate) ? prev : [...prev, completedDate],
      )
      const material = materials.find((m) => m.id === item.materialId)
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === item.materialId ? { ...m, lastReviewed: now.toISOString() } : m,
        ),
      )
      if (material) {
        const due = new Date(now)
        due.setDate(due.getDate() + quizFrequencyDays)
        const nextQuiz = makeQuizItemForMaterial(material, due)
        setPlanItems((prev) => ([
          ...prev.map((p) => (p.id === item.id ? { ...p, done: true } : p)),
          nextQuiz,
        ]))
        return
      }
    }
    setPlanItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, done: true } : p)),
    )
  }

  function snoozePlanItem(item: PlanItem) {
    setPlanItems((prev) =>
      prev.map((p) => {
        if (p.id !== item.id) return p
        const base = p.date ? new Date(`${p.date}T12:00:00`) : new Date()
        base.setHours(12, 0, 0, 0)
        base.setDate(base.getDate() + 1)
        return {
          ...p,
          day: base.toLocaleDateString(undefined, { weekday: 'short' }),
          date: formatIsoDate(base),
          done: false,
        }
      }),
    )
  }

  function lastReviewedLabel(item: PlanItem) {
    if (item.materialId == null) return null
    const material = materials.find((m) => m.id === item.materialId)
    if (!material?.lastReviewed) return 'Never reviewed'
    return `Last reviewed ${formatRelative(material.lastReviewed)}`
  }

  function openMaterialViewer(material: Material) {
    setMaterialMenuId(null)
    setViewingMaterial(material)
    setViewText('')

    if (!material.file) {
      setViewText('No stored source is available for this file.')
      return
    }

    if (material.name.toLowerCase().endsWith('.pdf')) {
      return
    }

    if (previewKind(material.name) === 'text') {
      material.file
        .text()
        .then((text) => {
          setViewText(text)
        })
        .catch(() => {
          setViewText('This file could not be read as text.')
        })
    } else {
      setViewText('Preview is not available for this file type.')
    }
  }

  function closeMaterialViewer() {
    setViewingMaterial(null)
    setViewText('')
    setShowCapture(false)
  }

  function MaterialPreview() {
    if (!viewingMaterial) return null

    const isPdf = viewingMaterial.name.toLowerCase().endsWith('.pdf')

    return (
      <div className="file-preview">
        <div className="file-preview-head">
          <h2>{viewingMaterial.name}</h2>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={closeMaterialViewer}
          >
            Close
          </button>
        </div>
        {isPdf && viewingMaterial.file ? (
          <Suspense fallback={<p className="pdf-status">Loading PDF viewer…</p>}>
            <PdfPreview file={viewingMaterial.file} />
          </Suspense>
        ) : (
          <pre className="viewer-text">{viewText || 'No preview available.'}</pre>
        )}
        <CaptureButton />
      </div>
    )
  }

  function CaptureButton() {
    return (
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
    )
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
              accept={ALLOWED_FILE_TYPES.join(',')}
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
          <div className="upload-date">
            <label htmlFor="upload-date">Date introduced</label>
            <input
              id="upload-date"
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
            />
            <p className="upload-date-hint">Leave blank to use today’s date.</p>
            {uploadError && <p className="upload-error">{uploadError}</p>}
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
            <strong>{focusStreak} {focusStreak === 1 ? 'day' : 'days'}</strong>
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
                <label htmlFor="tutor-quiz-frequency">Quiz frequency (days)</label>
                <input
                  id="tutor-quiz-frequency"
                  type="number"
                  min={1}
                  step={1}
                  value={frequencyDraft}
                  onChange={(e) => setFrequencyDraft(Number(e.target.value))}
                />

                <p className="settings-section">Amazon Bedrock</p>
                <label htmlFor="bedrock-region">Region</label>
                <input
                  id="bedrock-region"
                  value={bedrockRegionDraft}
                  onChange={(e) => setBedrockRegionDraft(e.target.value)}
                  placeholder="us-west-2"
                />
                <label htmlFor="bedrock-access-key-id">Access key ID</label>
                <input
                  id="bedrock-access-key-id"
                  value={bedrockAccessKeyIdDraft}
                  onChange={(e) => setBedrockAccessKeyIdDraft(e.target.value)}
                  placeholder="AKIA…"
                  autoComplete="off"
                />
                <label htmlFor="bedrock-secret-access-key">Secret access key</label>
                <input
                  id="bedrock-secret-access-key"
                  type="password"
                  value={bedrockSecretAccessKeyDraft}
                  onChange={(e) => setBedrockSecretAccessKeyDraft(e.target.value)}
                  placeholder="Enter your secret access key"
                  autoComplete="off"
                />
                <label htmlFor="bedrock-session-token">Session token (optional)</label>
                <input
                  id="bedrock-session-token"
                  type="password"
                  value={bedrockSessionTokenDraft}
                  onChange={(e) => setBedrockSessionTokenDraft(e.target.value)}
                  placeholder="For temporary credentials"
                  autoComplete="off"
                />
                <label htmlFor="bedrock-model-id">Model ID</label>
                <input
                  id="bedrock-model-id"
                  value={bedrockModelIdDraft}
                  onChange={(e) => setBedrockModelIdDraft(e.target.value)}
                  placeholder="anthropic.claude-3-5-sonnet-20241022-v2:0"
                />
                <p className="settings-note">
                  AWS credentials are kept in memory for this session only and are never saved to
                  your browser. For persistent, secure storage, connect a backend (e.g. AWS Secrets
                  Manager) instead of using secrets in the browser.
                </p>

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
          <section className="panel tutor-panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">AI Tutor</p>
                <h1>Ask anything you’re studying</h1>
              </div>
              <div className="head-side">
                <p className="stat">
                  {model}
                  <span>Active tutor model</span>
                </p>
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
              </div>
            </header>
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
            <CaptureButton />
          </section>
        )}

        {view === 'plan' && (
          <section className="panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Study Plan</p>
                <h1>This week, in order</h1>
                <p className="week-range">
                  {formatWeekRange(weekRange.start, weekRange.end)}
                </p>
              </div>
              <p className="stat">
                {doneCount} of {visiblePlanItems.length} sessions done
                <span>Space out heavier sessions across the week.</span>
              </p>
            </header>
            <ol className="plan">
              {visiblePlanItems.map((item) => (
                <li key={item.id} className={item.done ? 'done' : undefined}>
                  <span className="day">{item.day}</span>
                  <div className="plan-body">
                    <strong>{item.title}</strong>
                    <p>
                      {item.minutes} min
                      {item.date ? ` · ${formatPlanDate(item.date)}` : ''}
                    </p>
                    {lastReviewedLabel(item) && (
                      <p className="last-reviewed">{lastReviewedLabel(item)}</p>
                    )}
                  </div>
                  <div className="plan-actions">
                    {item.kind === 'quiz' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => snoozePlanItem(item)}
                      >
                        Snooze
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => completePlanItem(item)}
                      disabled={item.done}
                    >
                      {item.done ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                </li>
              ))}
              {visiblePlanItems.length === 0 && <p className="empty">No study sessions planned yet.</p>}
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
                    className={`folder${materialFolder === folder.id ? ' active' : ''}${materialDropFolder === folder.id ? ' drop-over' : ''}`}
                    onClick={() => setMaterialFolder(folder.id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setMaterialDropFolder(folder.id)
                    }}
                    onDragLeave={() => setMaterialDropFolder(null)}
                    onDrop={(e) => dropOnFolder(e, folder.id, 'material')}
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
                    <div className="folder-create-actions">
                      <button className="btn btn-primary" type="submit">
                        Create folder
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setShowMaterialFolderForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
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
                  <label className="check select-all">
                    <input
                      type="checkbox"
                      checked={visibleMaterials.length > 0 && visibleMaterials.every((m) => selectedMaterialIds.includes(m.id))}
                      onChange={toggleMaterialSelectAll}
                    />
                    Select all
                  </label>
                  <input
                    value={materialQuery}
                    onChange={(e) => setMaterialQuery(e.target.value)}
                    placeholder="Search files"
                    aria-label="Search files"
                  />
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      setUploadError('')
                      setShowUpload(true)
                    }}
                  >
                    Add file
                  </button>
                </div>

                {selectedMaterialCount > 0 && (
                  <div className="bulk-bar">
                    <span>{selectedMaterialCount} selected</span>
                    <select
                      value={materialMoveTarget}
                      onChange={(e) => setMaterialMoveTarget(e.target.value)}
                      aria-label="Move selected files to folder"
                      disabled={selectedMaterialCount === 0}
                    >
                      {materialFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={selectedMaterialCount === 0}
                      onClick={addSelectedMaterialsToStudyPlan}
                    >
                      Add to study plan
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={selectedMaterialCount === 0}
                      onClick={moveSelectedMaterials}
                    >
                      Move to folder
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={selectedMaterialCount === 0}
                      onClick={deleteSelectedMaterials}
                    >
                      Delete selected
                    </button>
                  </div>
                )}

                <div className="materials">
                  {visibleMaterials.map((material) => (
                    <article
                      key={material.id}
                      className={selectedMaterialIds.includes(material.id) ? 'material selected' : 'material'}
                      draggable
                      onDragStart={(e) => {
                        clearDragImage(e)
                        setDraggedMaterialId(material.id)
                      }}
                      onDragEnd={() => setDraggedMaterialId(null)}
                    >
                      <div className="material-top">
                        <label className="check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedMaterialIds.includes(material.id)}
                            onChange={() => toggleMaterialSelected(material.id)}
                            aria-label={`Select ${material.name}`}
                          />
                        </label>
                        <span>{material.type}</span>
                        {material.isStudyMaterial && (
                          <span className="study-symbol" title="In study plan" aria-label="In study plan">
                            ★
                          </span>
                        )}
                        <div className="material-menu-wrap">
                          <button
                            className="icon-btn material-menu-btn"
                            type="button"
                            aria-label={`Actions for ${material.name}`}
                            aria-expanded={materialMenuId === material.id}
                            onClick={() => setMaterialMenuId(materialMenuId === material.id ? null : material.id)}
                          >
                            ⋯
                          </button>
                          {materialMenuId === material.id && (
                            <div className="material-menu">
                              <button
                                type="button"
                                onClick={() => openMaterialViewer(material)}
                              >
                                <span aria-hidden>↗</span>
                                Open file
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  toggleStudyMaterial(material)
                                  setMaterialMenuId(null)
                                }}
                              >
                                <span aria-hidden>{material.isStudyMaterial ? '★' : '☆'}</span>
                                {material.isStudyMaterial ? 'In study plan' : 'Add to study plan'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDateId(material.id)
                                  setMaterialMenuId(null)
                                }}
                              >
                                <span aria-hidden>📅</span>
                                Change date introduced
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => deleteMaterial(material.id)}
                              >
                                <span aria-hidden>🗑</span>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <h2>
                        <button
                          className="material-open-btn"
                          type="button"
                          onClick={() => openMaterialViewer(material)}
                        >
                          {material.name}
                        </button>
                      </h2>
                      <p>{materialFolderNameFor(material.folderId)}</p>
                      {editingDateId === material.id ? (
                        <label className="material-date">
                          <span>Date introduced</span>
                          <input
                            type="date"
                            value={toDateInputValue(material.addedAt)}
                            onChange={(e) => updateMaterialDate(material.id, e.target.value)}
                            onBlur={() => setEditingDateId(null)}
                            autoFocus
                            aria-label={`Date introduced for ${material.name}`}
                          />
                        </label>
                      ) : (
                        <p className="material-date-text">
                          <span>Date introduced</span>
                          {formatDate(material.addedAt)}
                        </p>
                      )}
                    </article>
                  ))}
                  {visibleMaterials.length === 0 && <p className="empty">No files in this folder.</p>}
                </div>
              </div>
            </div>
            {showUpload && <MaterialUploadModal />}
            {viewingMaterial && <MaterialPreview />}
          </section>
        )}

        {view === 'notes' && (
          <section className="panel notes-panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Smart Notes</p>
                <h1>{editingNote ? 'Editor' : 'Ideas you can find again'}</h1>
                {noteIntegrationStatus && <p className="integration-status">{noteIntegrationStatus}</p>}
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
                      className={`folder${activeFolder === folder.id ? ' active' : ''}${noteDropFolder === folder.id ? ' drop-over' : ''}`}
                      onClick={() => setActiveFolder(folder.id)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setNoteDropFolder(folder.id)
                      }}
                      onDragLeave={() => setNoteDropFolder(null)}
                      onDrop={(e) => dropOnFolder(e, folder.id, 'note')}
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
                      <div className="folder-create-actions">
                        <button className="btn btn-primary" type="submit">
                          Create folder
                        </button>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => setShowFolderForm(false)}
                        >
                          Cancel
                        </button>
                      </div>
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
                    <label className="check select-all">
                      <input
                        type="checkbox"
                        checked={visibleNotes.length > 0 && visibleNotes.every((n) => selectedIds.includes(n.id))}
                        onChange={toggleSelectAll}
                      />
                      Select all
                    </label>
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

                  {selectedCount > 0 && (
                    <div className="bulk-bar">
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
                  )}

                  <div className="notes">
                    {visibleNotes.map((note) => (
                      <article
                        key={note.id}
                        className={selectedIds.includes(note.id) ? 'note selected' : 'note'}
                        draggable
                        onDragStart={(e) => {
                          clearDragImage(e)
                          setDraggedNoteId(note.id)
                        }}
                        onDragEnd={() => setDraggedNoteId(null)}
                      >
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
