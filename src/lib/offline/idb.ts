import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

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

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV)
        if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result as IDBDatabase)
      req.onerror = () => reject(req.error)
    } catch (e) {
      reject(e)
    }
  })

const txDone = (tx: IDBTransaction): Promise<null> =>
  new Promise<null>((resolve, reject) => {
    tx.oncomplete = () => resolve(null)
    tx.onabort = () => reject(tx.error)
    tx.onerror = () => reject(tx.error)
  })

export const kvGet = async (key: unknown): Promise<unknown | null> => {
  const k = String(key || '')
  if (!k) return null
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
  if (!hasIndexedDb()) {
    try {
      const raw = window.localStorage.getItem('it.queue.v1') || '[]'
      const list = parseJsonWithSchema(raw, z.array(z.record(z.unknown()))) || []
      const next = list.filter((x: Record<string, unknown>) => String(x?.id || '') !== id)
      next.push(jobObj)
      window.localStorage.setItem('it.queue.v1', JSON.stringify(next))
      return true
    } catch {
      return false
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  tx.objectStore(STORE_QUEUE).put(jobObj)
  await txDone(tx).catch((): null => null)
  return true
}

export const queueDelete = async (id: unknown): Promise<boolean> => {
  const key = String(id || '').trim()
  if (!key) return false
  if (!hasIndexedDb()) {
    try {
      const raw = window.localStorage.getItem('it.queue.v1') || '[]'
      const list = parseJsonWithSchema(raw, z.array(z.record(z.unknown()))) || []
      const next = list.filter((x: Record<string, unknown>) => String(x?.id || '') !== key)
      window.localStorage.setItem('it.queue.v1', JSON.stringify(next))
      return true
    } catch {
      return false
    }
  }
  const db = await openDb()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  tx.objectStore(STORE_QUEUE).delete(key)
  await txDone(tx).catch((): null => null)
  return true
}

export const queueGetAll = async (): Promise<unknown[]> => {
  if (!hasIndexedDb()) {
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
  return list
}
