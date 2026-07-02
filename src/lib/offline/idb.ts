import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { nfsPutJob, nfsDeleteJob, nfsGetAllJobs } from './nativeFs'
import {
  nativeKvGet,
  nativeKvSet,
  nativeQueuePut,
  nativeQueueGetAll,
  nativeQueueDelete,
} from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

// Notifica a UI (badge de pendências) que a fila mudou — o hook useOfflineSync
// ouve 'irontracks.offlineQueueChanged' mas NINGUÉM disparava, então o badge só
// atualizava no tick de 15s. Guardado p/ SSR/worker (sem window).
const notifyQueueChanged = () => {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('irontracks.offlineQueueChanged'))
    }
  } catch { /* best effort */ }
}

const DB_NAME = 'irontracks'
const DB_VERSION = 1
const STORE_KV = 'kv'
const STORE_QUEUE = 'queue'

const hasIndexedDb = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

// Fix #11: Singleton connection cache — prevents concurrent onupgradeneeded
let cachedDb: IDBDatabase | null = null
let openingPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  // Return cached connection if still open
  if (cachedDb) {
    try {
      // Verify connection is still alive by checking objectStoreNames
      cachedDb.objectStoreNames
      return Promise.resolve(cachedDb)
    } catch {
      cachedDb = null
    }
  }
  // Deduplicate concurrent open calls
  if (openingPromise) return openingPromise
  openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV)
        if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
      }
      req.onsuccess = () => {
        cachedDb = req.result as IDBDatabase
        cachedDb.onclose = () => { cachedDb = null }
        openingPromise = null
        resolve(cachedDb)
      }
      req.onerror = () => {
        openingPromise = null
        reject(req.error)
      }
    } catch (e) {
      openingPromise = null
      reject(e)
    }
  })
  return openingPromise
}

const txDone = (tx: IDBTransaction): Promise<null> =>
  new Promise<null>((resolve, reject) => {
    tx.oncomplete = () => resolve(null)
    tx.onabort = () => reject(tx.error)
    tx.onerror = () => reject(tx.error)
  })

export const kvGet = async (key: unknown): Promise<unknown | null> => {
  const k = String(key || '')
  if (!k) return null

  // Fast path on iOS native: SQLite3 (Feature 16). Fall through to IDB on
  // miss so the migration window doesn't lose data already written elsewhere.
  if (isIosNative()) {
    try {
      const raw = await nativeKvGet(k)
      if (raw !== null && raw !== undefined && raw !== '') {
        return parseJsonWithSchema(raw, z.unknown())
      }
    } catch { /* fall through to IDB */ }
  }

  if (!hasIndexedDb()) {
    try {
      const raw = window.localStorage.getItem(`it.kv.${k}`) || ''
      return raw ? parseJsonWithSchema(raw, z.unknown()) : null
    } catch {
      return null
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_KV, 'readonly')
  const store = tx.objectStore(STORE_KV)
  const req = store.get(k)
  const val = await new Promise<unknown | null>((resolve) => {
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => resolve(null)
  })
  await txDone(tx).catch((): null => null)
  return val
}

export const kvSet = async (key: unknown, value: unknown): Promise<boolean> => {
  const k = String(key || '')
  if (!k) return false

  // Dual-write: native SQLite3 fast path + IDB legacy path. We don't await the
  // native write — IDB remains source of truth for now so failures here don't
  // block the call. A future cleanup pass can flip the priority.
  if (isIosNative()) {
    void nativeKvSet(k, JSON.stringify(value ?? null)).catch(() => { /* best effort */ })
  }

  if (!hasIndexedDb()) {
    try {
      window.localStorage.setItem(`it.kv.${k}`, JSON.stringify(value ?? null))
      return true
    } catch {
      return false
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_KV, 'readwrite')
  tx.objectStore(STORE_KV).put(value ?? null, k)
  await txDone(tx).catch((): null => null)
  return true
}

export const queuePut = async (job: unknown): Promise<boolean> => {
  const j = job && typeof job === 'object' ? (job as Record<string, unknown>) : null
  const id = String(j?.id || '').trim()
  if (!id) return false
  const jobObj = j as Record<string, unknown>

  // Write-through to native filesystem (survives iOS force-close)
  nfsPutJob(jobObj).catch(() => { /* best effort */ })

  // Native SQLite3 fast path on iOS — survives iOS app suspension better than
  // IDB and gives indexed status / next_attempt_at scans for the flush loop.
  if (isIosNative()) {
    void nativeQueuePut({
      id,
      payload: JSON.stringify(jobObj),
      status: typeof jobObj?.status === 'string' ? (jobObj.status as string) : 'pending',
      attempts: typeof jobObj?.attempts === 'number' ? (jobObj.attempts as number) : 0,
      nextAttemptAt: typeof jobObj?.nextAttemptAt === 'number' ? (jobObj.nextAttemptAt as number) : 0,
    }).catch(() => { /* best effort */ })
  }

  if (!hasIndexedDb()) {
    try {
      const raw = window.localStorage.getItem('it.queue.v1') || '[]'
      const list = parseJsonWithSchema(raw, z.array(z.record(z.unknown()))) || []
      const next = list.filter((x: Record<string, unknown>) => String(x?.id || '') !== id)
      next.push(jobObj)
      window.localStorage.setItem('it.queue.v1', JSON.stringify(next))
      notifyQueueChanged()
      return true
    } catch {
      return false
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  tx.objectStore(STORE_QUEUE).put(jobObj)
  await txDone(tx).catch((): null => null)
  notifyQueueChanged()
  return true
}

export const queueDelete = async (id: unknown): Promise<boolean> => {
  const key = String(id || '').trim()
  if (!key) return false

  // Remove from native filesystem too. AWAIT: se soltar sem esperar, uma leitura
  // seguinte (queueGetAll) podia ver o arquivo ainda lá e "ressuscitar" o job já
  // concluído → reprocessado → duplicata no banco (iOS nativo).
  await nfsDeleteJob(key).catch(() => { /* best effort */ })

  // Remove from native SQLite3 cache (Feature 16)
  if (isIosNative()) {
    await nativeQueueDelete(key).catch(() => { /* best effort */ })
  }

  if (!hasIndexedDb()) {
    try {
      const raw = window.localStorage.getItem('it.queue.v1') || '[]'
      const list = parseJsonWithSchema(raw, z.array(z.record(z.unknown()))) || []
      const next = list.filter((x: Record<string, unknown>) => String(x?.id || '') !== key)
      window.localStorage.setItem('it.queue.v1', JSON.stringify(next))
      notifyQueueChanged()
      return true
    } catch {
      return false
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  tx.objectStore(STORE_QUEUE).delete(key)
  await txDone(tx).catch((): null => null)
  notifyQueueChanged()
  return true
}

// Lê a fila SÓ do IndexedDB (sem cascata). Usado no ramo iOS pra mesclar jobs que
// só existem no IDB — um write nativo (nativeQueuePut) pode falhar/ser descartado
// sem await, deixando o job apenas no IDB e invisível enquanto o SQLite tiver
// outros jobs (o ramo iOS retornava só o SQLite).
const idbGetAllJobs = async (): Promise<Record<string, unknown>[]> => {
  if (!hasIndexedDb()) return []
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_QUEUE, 'readonly')
    const req = tx.objectStore(STORE_QUEUE).getAll()
    const list = await new Promise<unknown[]>((resolve) => {
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as unknown[]) : [])
      req.onerror = () => resolve([])
    })
    await txDone(tx).catch((): null => null)
    return list.filter((j): j is Record<string, unknown> => Boolean(j && typeof j === 'object'))
  } catch {
    return []
  }
}

const jobId = (j: unknown): string => String((j as Record<string, unknown>)?.id || '').trim()

export const queueGetAll = async (): Promise<unknown[]> => {
  // Native SQLite3 first on iOS — fastest path, indexed by next_attempt_at.
  // If empty, fall through to IDB / FS / localStorage so we recover any
  // jobs queued before the SQLite store existed.
  if (isIosNative()) {
    try {
      const payloads = await nativeQueueGetAll(1000)
      const jobs: Record<string, unknown>[] = []
      for (const p of payloads) {
        try {
          const parsed = parseJsonWithSchema(p, z.record(z.unknown()))
          if (parsed && typeof parsed === 'object') jobs.push(parsed as Record<string, unknown>)
        } catch { /* skip corrupted */ }
      }
      // Mescla jobs que só existem no IDB (write nativo falhou/descartado) — dedup
      // por id, SQLite tem prioridade. Sem isso, um job IDB-only ficava invisível a
      // todo flush enquanto o SQLite tivesse outros jobs (ex.: um 'failed' preso).
      const seen = new Set(jobs.map(jobId))
      for (const j of await idbGetAllJobs()) {
        const id = jobId(j)
        if (id && !seen.has(id)) { jobs.push(j); seen.add(id) }
      }
      if (jobs.length > 0) return jobs
    } catch { /* fall through */ }
  }

  if (!hasIndexedDb()) {
    // Try native filesystem first (iOS), fall back to localStorage
    try {
      const nfsJobs = await nfsGetAllJobs()
      if (nfsJobs.length > 0) return nfsJobs
    } catch { /* fall through */ }
    try {
      const raw = window.localStorage.getItem('it.queue.v1') || '[]'
      const list = parseJsonWithSchema(raw, z.array(z.record(z.unknown())))
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_QUEUE, 'readonly')
  const store = tx.objectStore(STORE_QUEUE)
  const req = store.getAll()
  const list = await new Promise<unknown[]>((resolve) => {
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as unknown[]) : [])
    req.onerror = () => resolve([])
  })
  await txDone(tx).catch((): null => null)

  // If IDB is empty but native FS has jobs (recovery after force-close), merge them
  if (list.length === 0) {
    try {
      const nfsJobs = await nfsGetAllJobs()
      if (nfsJobs.length > 0) {
        for (const job of nfsJobs) {
          try {
            const rdb = await openDb()
            const rtx = rdb.transaction(STORE_QUEUE, 'readwrite')
            rtx.objectStore(STORE_QUEUE).put(job)
            await txDone(rtx).catch((): null => null)
          } catch { /* best effort */ }
        }
        return nfsJobs
      }
    } catch { /* no native fs available */ }
  }

  return list
}
