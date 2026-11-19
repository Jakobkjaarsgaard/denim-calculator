import type {
  AppPersistedState,
  CandidateListing,
  ReferencePair,
} from './types'
import { createStoredMeasurement } from './units'

export function createEmptyReferencePair(): ReferencePair {
  return {
    name: '',
    condition: 'washed_worn',
    measurements: {},
  }
}

export function createEmptyCandidate(index: number, id?: string): CandidateListing {
  const letters = ['A', 'B', 'C']
  const label = letters[index] ?? String(index + 1)
  return {
    id: id ?? `candidate-${label.toLowerCase()}-${Date.now()}`,
    name: `Candidate ${label}`,
    url: '',
    condition: 'washed_worn',
    measurements: {},
  }
}

export function createExampleReferencePair(): ReferencePair {
  return {
    name: 'My Favourite Pair (Reference)',
    condition: 'washed_worn',
    measurements: {
      waist: createStoredMeasurement('42', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      thigh: createStoredMeasurement('34', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      hem: createStoredMeasurement('24', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
    },
  }
}

export function createExampleCandidateA(): CandidateListing {
  return {
    id: 'example-candidate-a',
    name: 'Candidate A',
    url: '',
    condition: 'washed_worn',
    measurements: {
      waist: createStoredMeasurement('42', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      thigh: createStoredMeasurement('31', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      hem: createStoredMeasurement('21', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
    },
  }
}

export function createExampleCandidateB(): CandidateListing {
  return {
    id: 'example-candidate-b',
    name: 'Candidate B',
    url: '',
    condition: 'washed_worn',
    measurements: {
      waist: createStoredMeasurement('41.5', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      thigh: createStoredMeasurement('33.5', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
      hem: createStoredMeasurement('24', 'cm', {
        convention: 'standard',
        confirmed: true,
      })!,
    },
  }
}

export function createExampleState(): AppPersistedState {
  return {
    version: 1,
    displayUnit: 'cm',
    reference: createExampleReferencePair(),
    candidates: [createExampleCandidateA()],
  }
}

export const SYNTHETIC_OCR_LISTING_TEXT = `Studio D'Artisan SD-103 Lot 44
Tagged W33 L34 - Asking €145
Waist laid flat: 41.5 cm
Thigh (2.5 cm below crotch): 33.5 cm
Front rise: 27.5 cm
Knee: 22.5 cm
Leg opening: 24 cm
Inseam: 78 cm`

export const FIXTURE_TAGGED_AND_PRICE_TEXT =
  'Tagged W32 L32, asking €95, hem 8 1/2 in.'

export const FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT =
  '84 cm waistband circumference'

export const FIXTURE_AMBIGUOUS_WAIST_TEXT = 'waist 84'
