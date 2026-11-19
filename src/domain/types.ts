export type DimensionKey =
  | 'waist'
  | 'thigh'
  | 'frontRise'
  | 'knee'
  | 'hem'
  | 'inseam'

export type Unit = 'cm' | 'in'

export type MeasurementConvention =
  | 'standard'
  | 'circumference_halved'
  | 'unknown'
  | 'incompatible'

export type GarmentCondition =
  | 'washed_worn'
  | 'one_wash'
  | 'raw_unwashed'
  | 'unknown'

export interface DimensionSpec {
  key: DimensionKey
  label: string
  shortLabel: string
  isFlatWidth: boolean
  isPriority: boolean
  howToMeasure: string
  sellerMethodPhrase: string
}

/**
 * Adjustable product assumption:
 * Absolute delta up to and including 0.5 cm reads "similar measurement".
 * Change this constant if buyer feedback in Step 8 indicates a tighter or looser tolerance.
 */
export const SIMILAR_MEASUREMENT_THRESHOLD_CM = 0.5

export const PRIORITY_DIMENSIONS: readonly DimensionKey[] = [
  'waist',
  'thigh',
  'hem',
] as const

export const SECONDARY_DIMENSIONS: readonly DimensionKey[] = [
  'frontRise',
  'knee',
  'inseam',
] as const

export const DIMENSION_ORDER: readonly DimensionKey[] = [
  'waist',
  'thigh',
  'frontRise',
  'knee',
  'hem',
  'inseam',
] as const

export const DIMENSION_SPECS: Record<DimensionKey, DimensionSpec> = {
  waist: {
    key: 'waist',
    label: 'Flat waist (flat width)',
    shortLabel: 'Flat waist',
    isFlatWidth: true,
    isPriority: true,
    howToMeasure:
      'Button jeans, align the front and back edges of the waistband, lay flat and unstretched, then measure straight across.',
    sellerMethodPhrase:
      'flat waist width (buttoned, front and back waistband edges aligned, laid flat and unstretched straight across)',
  },
  thigh: {
    key: 'thigh',
    label: 'Thigh (flat width)',
    shortLabel: 'Thigh',
    isFlatWidth: true,
    isPriority: true,
    howToMeasure:
      'Measure straight across one leg 2.5 cm below the crotch seam, perpendicular to the leg.',
    sellerMethodPhrase:
      'thigh width measured 2.5 cm below the crotch seam (straight across one leg, perpendicular to the leg, laid flat)',
  },
  frontRise: {
    key: 'frontRise',
    label: 'Front rise',
    shortLabel: 'Front rise',
    isFlatWidth: false,
    isPriority: false,
    howToMeasure:
      'Follow the front seam from the crotch seam intersection to the top of the waistband.',
    sellerMethodPhrase:
      'front rise (following the front seam from the crotch seam intersection to the top of the waistband)',
  },
  knee: {
    key: 'knee',
    label: 'Knee (flat width)',
    shortLabel: 'Knee',
    isFlatWidth: true,
    isPriority: false,
    howToMeasure:
      'Measure across one leg 33 cm down the inseam from the crotch.',
    sellerMethodPhrase:
      'knee width measured 33 cm down the inseam from the crotch (straight across one leg, laid flat)',
  },
  hem: {
    key: 'hem',
    label: 'Hem / leg opening (flat width)',
    shortLabel: 'Hem',
    isFlatWidth: true,
    isPriority: true,
    howToMeasure: 'Measure straight across one leg opening.',
    sellerMethodPhrase:
      'hem / leg opening width (measured straight across one leg opening, laid flat)',
  },
  inseam: {
    key: 'inseam',
    label: 'Inseam',
    shortLabel: 'Inseam',
    isFlatWidth: false,
    isPriority: false,
    howToMeasure: 'Follow the inside seam from crotch intersection to hem.',
    sellerMethodPhrase:
      'inseam length (following the inside seam from the crotch seam intersection to the hem)',
  },
}

export const CONDITION_LABELS: Record<GarmentCondition, string> = {
  washed_worn: 'Washed & worn-in',
  one_wash: 'One-wash / lightly worn',
  raw_unwashed: 'Raw / unwashed denim',
  unknown: 'Condition not specified',
}

export interface StoredMeasurement {
  /** Canonical measurement in centimetres, converted once at entry time (1 in = 2.54 cm) */
  cm: number
  /** Original raw text entered by the buyer or parsed from listing (e.g. "8 1/2" or "42,5") */
  rawInput: string
  /** Original unit in which the value was entered */
  enteredUnit: Unit
  /** Measuring convention status */
  convention: MeasurementConvention
  /** Optional description of the original measurement convention when supplied */
  conventionNote?: string
  /** Optional visible conversion note (e.g. halved from explicit 84 cm waistband circumference) */
  conversionNote?: string
  /** Whether the buyer has confirmed this measurement */
  confirmed: boolean
}

export type MeasurementsMap = Partial<Record<DimensionKey, StoredMeasurement>>

export interface ReferencePair {
  name: string
  condition: GarmentCondition
  measurements: MeasurementsMap
}

export interface CandidateListing {
  id: string
  name: string
  url?: string
  condition: GarmentCondition
  measurements: MeasurementsMap
}

export interface AppPersistedState {
  version: 1
  displayUnit: Unit
  reference: ReferencePair
  candidates: CandidateListing[]
}
