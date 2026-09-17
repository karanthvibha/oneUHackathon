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

type View = 'tutor' | 'plan' | 'notes' | 'files' | 'mastery'

type Message = { id: number; role: 'ai' | 'you'; text: string; translatedText?: string }
type Folder = { id: string; name: string }
type Note = { id: number; title: string; body: string; folderId: string }
type MasteryEntry = {
  mastery: number
  level: string
  trend: string
  strategy: { difficulty: string; support: string; technique: string }
}
type QuizQuestion = { question: string; choices: string[]; answer: number; explanation: string }
type Quiz = { title: string; questions: QuizQuestion[] }
type QuizSession = {
  materialId: number
  planItemId: string
  index: number
  selection: number | null
  score: number
  results: boolean[]
  finished: boolean
}
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
  { id: 'mastery', label: 'Concept Mastery', hint: 'Track your progress', icon: '◈' },
]

const seedMaterialFolders: Folder[] = [{ id: INBOX, name: 'Inbox' }]

const seedMaterials: Material[] = []

const languages = [
  { value: 'en', label: 'English', name: 'English' },
  { value: 'es', label: 'Español', name: 'Spanish' },
  { value: 'fr', label: 'Français', name: 'French' },
  { value: 'de', label: 'Deutsch', name: 'German' },
  { value: 'it', label: 'Italiano', name: 'Italian' },
  { value: 'pt', label: 'Português', name: 'Portuguese' },
  { value: 'hi', label: 'हिन्दी', name: 'Hindi' },
  { value: 'vi', label: 'Tiếng Việt', name: 'Vietnamese' },
  { value: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada' },
]

const seedFolders: Folder[] = [{ id: INBOX, name: 'Inbox' }]

const seedNotes: Note[] = []

const seedPlanItems: PlanItem[] = []

function titleFromBody(text: string) {
  const line = text.trim().split('\n')[0] ?? 'Untitled note'
  return line.slice(0, 48) || 'Untitled note'
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
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

function quizDue(item: PlanItem): boolean {
  if (item.kind !== 'quiz' || !item.date) return true
  return item.date <= formatIsoDate(new Date())
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
    title: `Quiz: ${stripExtension(material.name)}`,
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
      text: 'Hi — I’m your tutor. Ask me anything about your course material!',
    },
  ])
  const [draft, setDraft] = useState('')
  const [tutorBusy, setTutorBusy] = useState(false)
  const [capture, setCapture] = useState('')
  const [captureStatus, setCaptureStatus] = useState('')
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
  const [quizFrequencyDays, setQuizFrequencyDays] = useState<number>(() => {
    const stored = Number(localStorage.getItem('tutor-quiz-frequency') ?? DEFAULT_QUIZ_FREQUENCY_DAYS)
    return Number.isFinite(stored) && stored >= 1
      ? Math.round(stored)
      : DEFAULT_QUIZ_FREQUENCY_DAYS
  })
  const [quizQuestionCount, setQuizQuestionCount] = useState<number>(() => {
    const stored = Number(localStorage.getItem('quiz-question-count') ?? 5)
    return Number.isFinite(stored) && stored >= 1 && stored <= 10 ? Math.round(stored) : 5
  })
  const [showSettings, setShowSettings] = useState(false)
  const [nameDraft, setNameDraft] = useState(tutorName)
  const [frequencyDraft, setFrequencyDraft] = useState(quizFrequencyDays)
  const [targetLanguage, setTargetLanguage] = useState<string>(
    () => localStorage.getItem('tutor-lang') ?? 'en',
  )
  const [quizMode, setQuizMode] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<{
    question_text: string
    correct_answer: string
    concept: string
    difficulty: string
  } | null>(null)
  const [masteryProfile, setMasteryProfile] = useState<Record<string, MasteryEntry> | null>(null)
  const [masteryWeakest, setMasteryWeakest] = useState<string | null>(null)
  const [quizzes, setQuizzes] = useState<Record<number, Quiz>>({})
  const [quizBusy, setQuizBusy] = useState<Record<number, boolean>>({})
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null)

  useEffect(() => {
    if (view !== 'mastery') return
    let cancelled = false
    fetch(`${BACKEND_URL}/api/personalization/mastery?student_id=demo`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setMasteryProfile(data.profile ?? {})
          setMasteryWeakest(data.weakest_concept ?? null)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view])

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

  // Remove stale study-plan items whose material no longer exists (e.g. from
  // files that were deleted before cleanup was wired up).
  useEffect(() => {
    if (!materialsHydrated) return
    const materialIds = new Set(materials.map((m) => m.id))
    setPlanItems((prev) =>
      prev
        .filter((p) => p.materialId == null || materialIds.has(p.materialId))
        .filter((p) => p.kind !== 'study')
        .map((p) => {
          // Normalize quiz items: fix kind + always drop the file extension.
          if (p.kind === 'quiz' || p.title.startsWith('Quiz: ')) {
            return { ...p, kind: 'quiz', title: stripExtension(p.title) }
          }
          return p
        }),
    )
  }, [materialsHydrated, materials])

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
  const selectedLanguage = languages.find((l) => l.value === targetLanguage)
  const languageName = selectedLanguage?.name ?? 'English'
  const languageLabel = selectedLanguage?.label ?? 'English'
  const showTranslation = targetLanguage !== 'en'
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

  async function translateText(text: string): Promise<string> {
    const response = await fetch(`${BACKEND_URL}/api/tutor/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: languageName }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || `Translation failed (${response.status})`)
    return String(data?.translation ?? '').trim() || text
  }

  function appendAiMessage(text: string) {
    const id = Date.now() + 1
    const message: Message = { id, role: 'ai', text }
    setMessages((prev) => [...prev, message])
    if (showTranslation) {
      translateText(text)
        .then((translatedText) => {
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, translatedText } : m)))
        })
        .catch(() => {
          // Keep the English text as the fallback if translation fails.
        })
    }
  }

  async function sendTutor(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || tutorBusy) return
    setMessages((prev) => [...prev, { id: Date.now(), role: 'you', text }])
    setDraft('')
    setTutorBusy(true)

    try {
      if (quizMode) {
        if (!pendingQuestion) {
          // Generate a practice question for the entered concept.
          const response = await fetch(`${BACKEND_URL}/api/tutor/practice-question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: 'demo',
              concept: text,
              difficulty: 'medium',
              language: 'English',
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
          const questionText = String(data?.question_text ?? '').trim()
          const correctAnswer = String(data?.correct_answer ?? '').trim()
          const concept = String(data?.concept ?? text).trim()
          const difficulty = String(data?.difficulty ?? 'medium').trim()
          if (questionText) {
            setPendingQuestion({
              question_text: questionText,
              correct_answer: correctAnswer,
              concept,
              difficulty,
            })
          }
          appendAiMessage(questionText || 'Sorry — I couldn’t generate a question. Try again.')
        } else {
          // Grade the student's answer.
          const response = await fetch(`${BACKEND_URL}/api/tutor/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: pendingQuestion.question_text,
              correct_answer: pendingQuestion.correct_answer,
              student_answer: text,
              student_id: 'demo',
              concept: pendingQuestion.concept,
              difficulty: pendingQuestion.difficulty,
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
          const correct = Boolean(data?.correct)
          const feedback = String(data?.feedback ?? '').trim()
          setPendingQuestion(null)
          appendAiMessage(`${correct ? '✅ Correct!' : '❌ Not quite.'} ${feedback}`.trim())
        }
      } else {
        const response = await fetch(`${BACKEND_URL}/api/tutor/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: 'demo', question: text, language: 'English' }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
        const answer = String(data?.answer ?? '').trim()
        appendAiMessage(answer || 'Sorry — I got an empty reply. Try asking again.')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'ai', text: `Sorry, I couldn’t reach the tutor: ${message}` },
      ])
    } finally {
      setTutorBusy(false)
    }
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
    setCaptureStatus('Saved to Smart Notes')
    window.setTimeout(() => setCaptureStatus(''), 8000)
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

  function deleteFolder(id: string) {
    if (id === INBOX) return
    setNotes((prev) => prev.map((n) => (n.folderId === id ? { ...n, folderId: INBOX } : n)))
    setFolders((prev) => prev.filter((f) => f.id !== id))
    if (activeFolder === id) setActiveFolder(ALL)
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

    setShowSettings(false)
  }

  function updateLanguage(lang: string) {
    setTargetLanguage(lang)
    localStorage.setItem('tutor-lang', lang)
  }

  function startQuiz() {
    setQuizMode(true)
    setPendingQuestion(null)
  }

  function endQuiz() {
    setQuizMode(false)
    setPendingQuestion(null)
  }

  function renderChat(translated: boolean) {
    return messages.map((m) => (
      <article key={`${translated ? 'translated' : 'original'}-${m.id}`} className={`bubble ${m.role}`}>
        <span>{m.role === 'ai' ? tutorName : 'You'}</span>
        <p>{translated && m.role === 'ai' ? m.translatedText ?? m.text : m.text}</p>
      </article>
    ))
  }

  function uploadToTutor(material: Material) {
    if (!material.file) return
    const form = new FormData()
    form.append('file', material.file)
    form.append('doc_id', String(material.id))
    void fetch(`${BACKEND_URL}/api/tutor/upload`, { method: 'POST', body: form }).catch(() => {
      // Non-blocking: the tutor still works even if this upload fails.
    })
  }

  function removeFromTutor(id: number) {
    void fetch(`${BACKEND_URL}/api/tutor/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: String(id) }),
    }).catch(() => {})
  }

  function removePlanAndQuizForMaterial(id: number) {
    setPlanItems((prev) => prev.filter((p) => p.materialId !== id))
    setQuizzes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setQuizBusy((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setQuizSession((prev) => (prev?.materialId === id ? null : prev))
  }

  function deleteMaterial(id: number) {
    void deleteFileBlob(id)
    removeFromTutor(id)
    removePlanAndQuizForMaterial(id)
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
    selectedMaterialIds.forEach((id) => {
      void deleteFileBlob(id)
      removeFromTutor(id)
      removePlanAndQuizForMaterial(id)
    })
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
      targets.forEach((material) => {
        void generateQuiz(material)
      })
      const newItems: PlanItem[] = targets.map((material) => makeQuizItemForMaterial(material))
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

  function deleteMaterialFolder(id: string) {
    if (id === INBOX) return
    setMaterials((prev) => prev.map((m) => (m.folderId === id ? { ...m, folderId: INBOX } : m)))
    setMaterialFolders((prev) => prev.filter((f) => f.id !== id))
    if (materialFolder === id) setMaterialFolder(ALL)
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
        if (material.file) {
          void saveFileBlob(material.id, material.file)
          uploadToTutor(material)
        }
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
      void generateQuiz(material)
      setPlanItems((prev) => [makeQuizItemForMaterial(material), ...prev])
    }
  }

  function generateQuiz(material: Material) {
    if (!material.file || quizzes[material.id]) return
    setQuizBusy((prev) => ({ ...prev, [material.id]: true }))
    const form = new FormData()
    form.append('file', material.file)
    form.append('num_questions', String(quizQuestionCount))
    fetch(`${BACKEND_URL}/api/quiz/generate`, { method: 'POST', body: form })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
        return data as Quiz
      })
      .then((quiz) => {
        setQuizzes((prev) => ({ ...prev, [material.id]: quiz }))
      })
      .catch(() => {
        // Leave the quiz unset; clicking "Start quiz" will retry generation.
      })
      .finally(() => {
        setQuizBusy((prev) => ({ ...prev, [material.id]: false }))
      })
  }

  function openQuiz(item: PlanItem) {
    if (item.materialId == null) return
    const quiz = quizzes[item.materialId]
    if (quiz && quiz.questions.length > 0) {
      setQuizSession({
        materialId: item.materialId,
        planItemId: item.id,
        index: 0,
        selection: null,
        score: 0,
        results: [],
        finished: false,
      })
      return
    }
    // Not ready yet — (re)generate it.
    const material = materials.find((m) => m.id === item.materialId)
    if (material && !quizBusy[item.materialId]) generateQuiz(material)
  }

  function answerQuiz(choiceIndex: number) {
    setQuizSession((prev) => {
      if (!prev || prev.selection != null) return prev
      const quiz = quizzes[prev.materialId]
      if (!quiz) return prev
      const question = quiz.questions[prev.index]
      const correct = choiceIndex === question.answer
      return {
        ...prev,
        selection: choiceIndex,
        score: prev.score + (correct ? 1 : 0),
        results: [...prev.results, correct],
      }
    })
  }

  function nextQuizQuestion() {
    setQuizSession((prev) => {
      if (!prev) return prev
      const quiz = quizzes[prev.materialId]
      if (!quiz) return prev
      if (prev.index + 1 >= quiz.questions.length) {
        return { ...prev, finished: true }
      }
      return { ...prev, index: prev.index + 1, selection: null }
    })
  }

  function finishQuiz() {
    const session = quizSession
    if (session) {
      const item = planItems.find((p) => p.id === session.planItemId)
      if (item) completePlanItem(item)

      const material = materials.find((m) => m.id === session.materialId)
      const concept = material ? stripExtension(material.name) : `material-${session.materialId}`
      const interactions = session.results.map((correct) => ({
        concept,
        correct,
        difficulty: 'medium',
        attempts: 1,
        hints_used: 0,
      }))
      if (interactions.length > 0) {
        void fetch(`${BACKEND_URL}/api/personalization/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: 'demo', interactions }),
        }).catch(() => {})
      }
    }
    setQuizSession(null)
  }

  function closeQuiz() {
    setQuizSession(null)
  }

  function QuizModal() {
    if (!quizSession) return null
    const quiz = quizzes[quizSession.materialId]
    if (!quiz || quiz.questions.length === 0) return null
    const total = quiz.questions.length
    const question = quiz.questions[quizSession.index]

    return (
      <div className="modal-backdrop" role="presentation" onClick={closeQuiz}>
        <div
          className="modal quiz-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Quiz"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h2>{quiz.title || 'Quiz'}</h2>
            <button className="modal-close" type="button" aria-label="Close quiz" onClick={closeQuiz}>
              ×
            </button>
          </div>

          {quizSession.finished ? (
            <div className="quiz-result">
              <p className="quiz-score">
                You got {quizSession.score} of {total} correct.
              </p>
              <button className="btn btn-primary" type="button" onClick={finishQuiz}>
                Finish
              </button>
            </div>
          ) : (
            <div className="quiz-question">
              <p className="quiz-progress">
                Question {quizSession.index + 1} of {total}
              </p>
              <h3>{question.question}</h3>
              <div className="quiz-choices">
                {question.choices.map((choice, i) => {
                  const revealed = quizSession.selection != null
                  const isCorrect = i === question.answer
                  const isSelected = quizSession.selection === i
                  let cls = 'quiz-choice'
                  if (revealed && isCorrect) cls += ' correct'
                  if (revealed && isSelected && !isCorrect) cls += ' wrong'
                  if (isSelected) cls += ' selected'
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      disabled={revealed}
                      onClick={() => answerQuiz(i)}
                    >
                      <span className="quiz-choice-letter">{String.fromCharCode(65 + i)}</span>
                      {choice}
                    </button>
                  )
                })}
              </div>
              {quizSession.selection != null && (
                <div className="quiz-feedback">
                  <p>{question.explanation}</p>
                  <button className="btn btn-primary" type="button" onClick={nextQuizQuestion}>
                    {quizSession.index + 1 >= total ? 'See results' : 'Next question'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
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
              placeholder="Type your own points or paste notes…"
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
                <div className="tutor-tools">
                  <label className="tutor-lang" htmlFor="tutor-lang">
                    <span>Translate to</span>
                    <select
                      id="tutor-lang"
                      value={targetLanguage}
                      onChange={(e) => updateLanguage(e.target.value)}
                      aria-label="Response language"
                    >
                      {languages.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={quizMode ? endQuiz : startQuiz}
                  >
                    {quizMode ? 'End quiz' : 'Practice question'}
                  </button>
                </div>
              </div>
            </header>
            <div className={`chat-layout${showTranslation ? ' split' : ''}`}>
              <div className="chat-col">
                {showTranslation && <p className="chat-col-label">English</p>}
                <div className="chat" aria-live="polite">
                  {renderChat(false)}
                </div>
              </div>
              {showTranslation && (
                <div className="chat-col">
                  <p className="chat-col-label">{languageLabel}</p>
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
                placeholder={
                  quizMode
                    ? pendingQuestion
                      ? 'Type your answer…'
                      : 'Enter a concept to practice (e.g. BST)…'
                    : 'Explain osmosis like I’m in AP Bio…'
                }
                aria-label="Message the tutor"
                disabled={tutorBusy}
              />
              <button className="btn btn-primary" type="submit" disabled={tutorBusy}>
                {quizMode ? (pendingQuestion ? 'Submit answer' : 'Start quiz') : 'Send'}
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
            <div className="plan-quiz-settings">
              <label htmlFor="quiz-question-count">Questions per quiz</label>
              <input
                id="quiz-question-count"
                type="number"
                min={1}
                max={10}
                defaultValue={quizQuestionCount}
                onChange={(e) => {
                  const value = e.target.value
                  const n = Number(value)
                  if (value !== '' && Number.isFinite(n) && n >= 1 && n <= 10) {
                    setQuizQuestionCount(Math.round(n))
                    localStorage.setItem('quiz-question-count', String(Math.round(n)))
                  }
                }}
                onBlur={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (Number.isFinite(n) && n >= 1 && n <= 10) {
                    e.target.value = String(n)
                    setQuizQuestionCount(n)
                    localStorage.setItem('quiz-question-count', String(n))
                  } else {
                    e.target.value = String(quizQuestionCount)
                  }
                }}
              />
            </div>
            <ol className="plan">
              {visiblePlanItems.map((item) => (
                <li key={item.id} className={item.done ? 'done' : undefined}>
                  <span className="day">{item.day}</span>
                  <div className="plan-body">
                    <strong>{item.title}</strong>
                    <p>
                      {item.kind === 'quiz'
                        ? item.date
                          ? formatPlanDate(item.date)
                          : ''
                        : `${item.minutes} min${item.date ? ` · ${formatPlanDate(item.date)}` : ''}`}
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
                    {item.kind === 'quiz' ? (
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={item.done || !quizDue(item) || (item.materialId != null && quizBusy[item.materialId])}
                        onClick={() => openQuiz(item)}
                      >
                        {item.done
                          ? 'Done'
                          : !quizDue(item)
                            ? 'Not due yet'
                            : item.materialId != null && quizBusy[item.materialId]
                              ? 'Generating…'
                              : 'Start quiz'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => completePlanItem(item)}
                        disabled={item.done}
                      >
                        {item.done ? 'Done' : 'Mark done'}
                      </button>
                    )}
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
                  <div className="folder-row" key={folder.id}>
                    <button
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
                    {folder.id !== INBOX && (
                      <button
                        className="folder-delete"
                        type="button"
                        aria-label={`Delete folder ${folder.name}`}
                        title="Delete folder"
                        onClick={() => deleteMaterialFolder(folder.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
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
                    <div className="folder-row" key={folder.id}>
                      <button
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
                      {folder.id !== INBOX && (
                        <button
                          className="folder-delete"
                          type="button"
                          aria-label={`Delete folder ${folder.name}`}
                          title="Delete folder"
                          onClick={() => deleteFolder(folder.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
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

        {view === 'mastery' && (
          <section className="panel mastery-panel">
            <header className="panel-head">
              <p className="eyebrow">Concept Mastery</p>
              <h1>Your CS 2420 progress</h1>
            </header>

            {masteryWeakest && (
              <p className="mastery-weakest">
                Focus next on: <strong>{masteryWeakest}</strong>
              </p>
            )}

            {masteryProfile == null ? (
              <p className="empty">Loading your mastery…</p>
            ) : Object.keys(masteryProfile).length === 0 ? (
              <p className="empty">
                No mastery data yet — take some practice questions in the AI Tutor and your progress
                will show up here.
              </p>
            ) : (
              <div className="mastery-grid">
                {Object.entries(masteryProfile).map(([concept, entry]) => (
                  <article className="mastery-card" key={concept}>
                    <div className="mastery-card-head">
                      <h2>{concept}</h2>
                      <span className="mastery-level">{entry.level}</span>
                    </div>
                    <div className="mastery-bar" aria-hidden>
                      <div className="mastery-bar-fill" style={{ width: `${entry.mastery}%` }} />
                    </div>
                    <p className="mastery-pct">{entry.mastery}% mastery</p>
                    <p className="mastery-meta">
                      Trend: {entry.trend}
                      <br />
                      Next up: {entry.strategy.difficulty} · {entry.strategy.technique}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <QuizModal />
    </div>
  )
}
