export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable or full; ignore for this client-only app.
  }
}

const DB_NAME = 'lumen-study'
const FILE_STORE = 'files'

function openFilesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveFileBlob(id: number, file: File): Promise<void> {
  try {
    const db = await openFilesDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      tx.objectStore(FILE_STORE).put({ id, file })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Ignore persistence failures so upload flow still works.
  }
}

export async function deleteFileBlob(id: number): Promise<void> {
  try {
    const db = await openFilesDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite')
      tx.objectStore(FILE_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Ignore missing records or storage errors.
  }
}

export async function loadFileBlob(id: number): Promise<File | null> {
  try {
    const db = await openFilesDB()
    const file = await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readonly')
      const request = tx.objectStore(FILE_STORE).get(id)
      request.onsuccess = () => {
        const record = request.result as { id: number; file: File } | undefined
        resolve(record?.file ?? null)
      }
      request.onerror = () => reject(request.error)
    })
    db.close()
    return file
  } catch {
    return null
  }
}