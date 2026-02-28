/**
 * Native filesystem persistence for the offline queue.
 * Uses @capacitor/filesystem on iOS/Android to survive force-close.
 * Falls back silently to no-op on web.
 */

const QUEUE_DIR = 'irontracks_queue'

type FsModule = {
  Filesystem: {
    writeFile: (opts: { path: string; data: string; directory: number; recursive: boolean }) => Promise<unknown>
    readFile: (opts: { path: string; directory: number }) => Promise<{ data: string }>
    deleteFile: (opts: { path: string; directory: number }) => Promise<unknown>
    readdir: (opts: { path: string; directory: number }) => Promise<{ files: Array<{ name: string }> }>
    mkdir: (opts: { path: string; directory: number; recursive: boolean }) => Promise<unknown>
  }
  Directory: { Data: number }
}

let _fs: FsModule | null = null
let _fsChecked = false

const getFs = async (): Promise<FsModule | null> => {
  if (_fsChecked) return _fs
  _fsChecked = true
  try {
    const mod = await import('@capacitor/filesystem')
    if (mod?.Filesystem && typeof mod.Filesystem.writeFile === 'function') {
      _fs = mod as unknown as FsModule
      // Ensure directory exists
      try {
        await _fs.Filesystem.mkdir({ path: QUEUE_DIR, directory: _fs.Directory.Data, recursive: true })
      } catch { /* already exists */ }
    }
  } catch { /* not available on web */ }
  return _fs
}

const jobPath = (id: string) => `${QUEUE_DIR}/${encodeURIComponent(id)}.json`

export const nfsPutJob = async (job: Record<string, unknown>): Promise<boolean> => {
  const fs = await getFs()
  if (!fs) return false
  try {
    await fs.Filesystem.writeFile({
      path: jobPath(String(job.id || '')),
      data: JSON.stringify(job),
      directory: fs.Directory.Data,
      recursive: true,
    })
    return true
  } catch {
    return false
  }
}

export const nfsDeleteJob = async (id: string): Promise<boolean> => {
  const fs = await getFs()
  if (!fs) return false
  try {
    await fs.Filesystem.deleteFile({ path: jobPath(id), directory: fs.Directory.Data })
    return true
  } catch {
    return false
  }
}

export const nfsGetAllJobs = async (): Promise<Record<string, unknown>[]> => {
  const fs = await getFs()
  if (!fs) return []
  try {
    const { files } = await fs.Filesystem.readdir({ path: QUEUE_DIR, directory: fs.Directory.Data })
    const jobs: Record<string, unknown>[] = []
    for (const f of files) {
      if (!f.name.endsWith('.json')) continue
      try {
        const { data } = await fs.Filesystem.readFile({ path: `${QUEUE_DIR}/${f.name}`, directory: fs.Directory.Data })
        const parsed = JSON.parse(typeof data === 'string' ? data : '') as unknown
        if (parsed && typeof parsed === 'object') jobs.push(parsed as Record<string, unknown>)
      } catch { /* skip corrupted file */ }
    }
    return jobs
  } catch {
    return []
  }
}
