import {
  createEmptyCandidate,
  createEmptyReferencePair,
} from './fixtures'
import {
  DIMENSION_ORDER,
  type AppPersistedState,
  type CandidateListing,
  type GarmentCondition,
  type MeasurementConvention,
  type MeasurementsMap,
  type ReferencePair,
  type StoredMeasurement,
  type Unit,
} from './types'

export const STORAGE_KEY = 'denim_fit_check_saved_v1'

const VALID_UNITS = new Set<Unit>(['cm', 'in'])
const VALID_CONDITIONS = new Set<GarmentCondition>([
  'washed_worn',
  'one_wash',
  'raw_unwashed',
  'unknown',
])
const VALID_CONVENTIONS = new Set<MeasurementConvention>([
  'standard',
  'circumference_halved',
  'unknown',
  'incompatible',
])

export function createInitialUserState(): AppPersistedState {
  return {
    version: 1,
    displayUnit: 'cm',
    reference: createEmptyReferencePair(),
    candidates: [createEmptyCandidate(0, 'candidate-a')],
  }
}

function sanitizeMeasurement(raw: unknown): StoredMeasurement | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const cm = typeof obj.cm === 'number' ? obj.cm : Number.NaN
  if (!Number.isFinite(cm) || cm <= 0) return null

  const enteredUnit: Unit =
    typeof obj.enteredUnit === 'string' && VALID_UNITS.has(obj.enteredUnit as Unit)
      ? (obj.enteredUnit as Unit)
      : 'cm'

  const rawInput =
    typeof obj.rawInput === 'string' && obj.rawInput.trim() !== ''
      ? obj.rawInput.trim()
      : String(cm)

  const convention: MeasurementConvention =
    typeof obj.convention === 'string' &&
    VALID_CONVENTIONS.has(obj.convention as MeasurementConvention)
      ? (obj.convention as MeasurementConvention)
      : 'standard'

  const confirmed = typeof obj.confirmed === 'boolean' ? obj.confirmed : true
  // Only persist confirmed measurements
  if (!confirmed) return null

  return {
    cm,
    rawInput,
    enteredUnit,
    convention,
    conventionNote:
      typeof obj.conventionNote === 'string' ? obj.conventionNote : undefined,
    conversionNote:
      typeof obj.conversionNote === 'string' ? obj.conversionNote : undefined,
    confirmed: true,
  }
}

function sanitizeMeasurementsMap(raw: unknown): MeasurementsMap {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const result: MeasurementsMap = {}

  for (const dim of DIMENSION_ORDER) {
    if (dim in obj) {
      const sanitized = sanitizeMeasurement(obj[dim])
      if (sanitized) {
        result[dim] = sanitized
      }
    }
  }
  return result
}

function sanitizeReferencePair(raw: unknown): ReferencePair | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== 'string') return null

  const condition: GarmentCondition =
    typeof obj.condition === 'string' &&
    VALID_CONDITIONS.has(obj.condition as GarmentCondition)
      ? (obj.condition as GarmentCondition)
      : 'washed_worn'

  return {
    name: obj.name,
    condition,
    measurements: sanitizeMeasurementsMap(obj.measurements),
  }
}

function sanitizeCandidate(raw: unknown, index: number): CandidateListing | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== 'string') return null

  const condition: GarmentCondition =
    typeof obj.condition === 'string' &&
    VALID_CONDITIONS.has(obj.condition as GarmentCondition)
      ? (obj.condition as GarmentCondition)
      : 'washed_worn'

  return {
    id:
      typeof obj.id === 'string' && obj.id.trim() !== ''
        ? obj.id
        : `candidate-${index + 1}`,
    name: obj.name,
    url: typeof obj.url === 'string' ? obj.url : '',
    condition,
    measurements: sanitizeMeasurementsMap(obj.measurements),
  }
}

export interface LoadStorageResult {
  state: AppPersistedState
  hasSavedData: boolean
  storageAvailable: boolean
  recoveredFromMalformed: boolean
}

export function loadPersistedState(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): LoadStorageResult {
  const fallback = createInitialUserState()
  if (!storage) {
    return {
      state: fallback,
      hasSavedData: false,
      storageAvailable: false,
      recoveredFromMalformed: false,
    }
  }

  let rawJson: string | null = null
  try {
    rawJson = storage.getItem(STORAGE_KEY)
  } catch {
    return {
      state: fallback,
      hasSavedData: false,
      storageAvailable: false,
      recoveredFromMalformed: false,
    }
  }

  if (!rawJson) {
    return {
      state: fallback,
      hasSavedData: false,
      storageAvailable: true,
      recoveredFromMalformed: false,
    }
  }

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return {
        state: fallback,
        hasSavedData: false,
        storageAvailable: true,
        recoveredFromMalformed: true,
      }
    }

    const displayUnit: Unit =
      typeof parsed.displayUnit === 'string' &&
      VALID_UNITS.has(parsed.displayUnit as Unit)
        ? (parsed.displayUnit as Unit)
        : 'cm'

    const reference = sanitizeReferencePair(parsed.reference)
    if (!reference) {
      return {
        state: fallback,
        hasSavedData: false,
        storageAvailable: true,
        recoveredFromMalformed: true,
      }
    }

    if (!Array.isArray(parsed.candidates)) {
      return {
        state: fallback,
        hasSavedData: false,
        storageAvailable: true,
        recoveredFromMalformed: true,
      }
    }

    const candidates: CandidateListing[] = []
    for (let i = 0; i < Math.min(parsed.candidates.length, 3); i += 1) {
      const c = sanitizeCandidate(parsed.candidates[i], i)
      if (!c) {
        return {
          state: fallback,
          hasSavedData: false,
          storageAvailable: true,
          recoveredFromMalformed: true,
        }
      }
      candidates.push(c)
    }

    const finalCandidates =
      candidates.length > 0 ? candidates : [createEmptyCandidate(0, 'candidate-a')]

    const hasAnyData =
      reference.name.trim() !== '' ||
      Object.keys(reference.measurements).length > 0 ||
      finalCandidates.some(
        (c) => Object.keys(c.measurements).length > 0 || (c.url ?? '').trim() !== ''
      )

    return {
      state: {
        version: 1,
        displayUnit,
        reference,
        candidates: finalCandidates,
      },
      hasSavedData: hasAnyData,
      storageAvailable: true,
      recoveredFromMalformed: false,
    }
  } catch {
    return {
      state: fallback,
      hasSavedData: false,
      storageAvailable: true,
      recoveredFromMalformed: true,
    }
  }
}

/**
 * Persists only confirmed numeric measurements and names locally.
 * Never persists screenshot bytes, object URLs, or raw OCR text.
 */
export function savePersistedState(
  state: AppPersistedState,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): boolean {
  if (!storage) return false
  try {
    const cleanReference = sanitizeReferencePair(state.reference) ?? createEmptyReferencePair()
    const cleanCandidates = state.candidates
      .slice(0, 3)
      .map((c, idx) => sanitizeCandidate(c, idx))
      .filter((c): c is CandidateListing => c !== null)

    const payload: AppPersistedState = {
      version: 1,
      displayUnit: state.displayUnit,
      reference: cleanReference,
      candidates:
        cleanCandidates.length > 0
          ? cleanCandidates
          : [createEmptyCandidate(0, 'candidate-a')],
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function clearPersistedState(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : undefined
): boolean {
  if (!storage) return false
  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
