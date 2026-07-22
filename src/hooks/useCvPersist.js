import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

const DB_NAME = 'fitscore_cv'
const STORE = 'cvs'
const MAX_CVS = 5

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbSet(key, value) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

async function dbGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbDel(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function toStorageEntry(entry) {
  return { id: entry.id, name: entry.name, type: entry.type, size: entry.size, lastModified: entry.lastModified, blob: entry.blob }
}

function toRuntimeEntry(stored) {
  return {
    ...stored,
    file: new File([stored.blob], stored.name, { type: stored.type, lastModified: stored.lastModified || Date.now() })
  }
}

// ---- Shared store -------------------------------------------------------------------------
// A plain hook gives each component its OWN state, so a CV uploaded in <CvPanel> was invisible
// to <AnalyzerPage> (both called useCvPersist independently) until a full reload — which left
// the Analyze button disabled. Back the hook with a single module-level store so every
// component sees the same CV list the moment it changes.
let store = { cvList: [], activeCvId: null, loading: true, userId: undefined }
const listeners = new Set()

function setStore(patch) {
  store = { ...store, ...patch }
  listeners.forEach(fn => fn(store))
}

async function loadForUser(userId) {
  if (!userId) { setStore({ cvList: [], activeCvId: null, loading: false, userId }); return }
  setStore({ loading: true, userId })
  try {
    let list = await dbGet(`cv_list_${userId}`)
    let activeId = await dbGet(`cv_active_${userId}`)
    if (!list) {
      const old = await dbGet(`cv_${userId}`) // migrate old single-CV format
      if (old?.blob && old?.name) {
        const id = makeId()
        list = [{ id, name: old.name, type: old.type, size: old.size || 0, lastModified: old.lastModified || Date.now(), blob: old.blob }]
        activeId = id
        await dbSet(`cv_list_${userId}`, list)
        await dbSet(`cv_active_${userId}`, activeId)
      } else {
        list = []
      }
    }
    // Ignore a load that completed after the user changed.
    if (store.userId !== userId) return
    const withFiles = list.map(toRuntimeEntry)
    setStore({ cvList: withFiles, activeCvId: activeId || withFiles[0]?.id || null, loading: false })
  } catch (e) {
    console.log('CV load error:', e.message)
    if (store.userId === userId) setStore({ loading: false })
  }
}

async function saveCvToStore(userId, file) {
  const blob = new Blob([await file.arrayBuffer()], { type: file.type })
  const existingEntry = store.cvList.find(c => c.name === file.name)
  const id = existingEntry?.id || makeId()
  const newEntry = { id, name: file.name, type: file.type, size: file.size, lastModified: file.lastModified || Date.now(), blob, file }
  const updatedList = existingEntry
    ? store.cvList.map(c => c.id === id ? newEntry : c)
    : [...store.cvList, newEntry].slice(-MAX_CVS)
  setStore({ cvList: updatedList, activeCvId: id })
  if (!userId) return
  try {
    await dbSet(`cv_list_${userId}`, updatedList.map(toStorageEntry))
    await dbSet(`cv_active_${userId}`, id)
  } catch (e) {
    console.log('CV save error:', e.message)
  }
}

async function setActiveCvInStore(userId, id) {
  setStore({ activeCvId: id })
  if (!userId) return
  try { await dbSet(`cv_active_${userId}`, id) } catch {}
}

async function deleteCvFromStore(userId, id) {
  const updated = store.cvList.filter(c => c.id !== id)
  const newActiveId = store.activeCvId === id ? (updated[0]?.id || null) : store.activeCvId
  setStore({ cvList: updated, activeCvId: newActiveId })
  if (!userId) return
  try {
    await dbSet(`cv_list_${userId}`, updated.map(toStorageEntry))
    await dbSet(`cv_active_${userId}`, newActiveId)
  } catch {}
}

async function clearCvInStore(userId) {
  setStore({ cvList: [], activeCvId: null })
  if (!userId) return
  try {
    await dbDel(`cv_list_${userId}`)
    await dbDel(`cv_active_${userId}`)
  } catch {}
}

export function useCvPersist() {
  const { user } = useAuth()
  const userId = user?.id
  const [snapshot, setSnapshot] = useState(store)

  useEffect(() => {
    const listener = next => setSnapshot(next)
    listeners.add(listener)
    setSnapshot(store) // sync any change that happened between render and subscribe
    return () => { listeners.delete(listener) }
  }, [])

  // Load once per user; the shared store is reused by every hook instance.
  useEffect(() => {
    if (store.userId !== userId) loadForUser(userId)
  }, [userId])

  const cvFile = snapshot.cvList.find(c => c.id === snapshot.activeCvId)?.file || null

  return {
    cvFile,
    cvList: snapshot.cvList,
    activeCvId: snapshot.activeCvId,
    loading: snapshot.loading,
    saveCv: file => saveCvToStore(userId, file),
    setActiveCv: id => setActiveCvInStore(userId, id),
    deleteCv: id => deleteCvFromStore(userId, id),
    clearCv: () => clearCvInStore(userId)
  }
}
