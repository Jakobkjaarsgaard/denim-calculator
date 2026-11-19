import { describe, expect, it } from 'vitest'
import {
  compareCandidate,
  describeDimensionDelta,
  rankCandidates,
} from '../comparison'
import {
  FIXTURE_AMBIGUOUS_WAIST_TEXT,
  FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT,
  FIXTURE_TAGGED_AND_PRICE_TEXT,
  SYNTHETIC_OCR_LISTING_TEXT,
  createExampleCandidateA,
  createExampleCandidateB,
  createExampleReferencePair,
} from '../fixtures'
import {
  parseListingText,
  resolveProposalToMeasurement,
} from '../parser'
import {
  STORAGE_KEY,
  loadPersistedState,
  savePersistedState,
} from '../storage'
import {
  createStoredMeasurement,
  formatStoredMeasurement,
  getDisplayInputString,
  parseMeasurementInput,
  roundToOneDecimal,
} from '../units'

describe('Units, conversions, and validation', () => {
  it('suppresses negative zero when rounding to one decimal', () => {
    expect(roundToOneDecimal(-0.01)).toBe(0)
    expect(Object.is(roundToOneDecimal(-0.001), -0)).toBe(false)
    expect(roundToOneDecimal(21.59)).toBe(21.6)
  })

  it('converts inches to canonical cm once using 1 in = 2.54 cm, including ordinary fractions and decimal commas', () => {
    const hemRes = parseMeasurementInput('8 1/2', 'in')
    expect(hemRes.kind).toBe('valid')
    if (hemRes.kind === 'valid') {
      expect(hemRes.cm).toBeCloseTo(21.59, 5)
      expect(hemRes.rawInput).toBe('8 1/2')
      expect(hemRes.enteredUnit).toBe('in')
    }

    const commaRes = parseMeasurementInput('41,5', 'cm')
    expect(commaRes.kind).toBe('valid')
    if (commaRes.kind === 'valid') {
      expect(commaRes.cm).toBe(41.5)
    }

    const mixedInch = parseMeasurementInput('12 1/2', 'in')
    expect(mixedInch.kind).toBe('valid')
    if (mixedInch.kind === 'valid') {
      expect(mixedInch.cm).toBeCloseTo(31.75, 5)
    }
  })

  it('keeps converted values stable across repeated unit toggling without mutating canonical cm', () => {
    const stored = createStoredMeasurement('8 1/2', 'in')!
    expect(stored.cm).toBeCloseTo(21.59, 5)

    // Toggle display cm <-> in repeatedly
    for (let i = 0; i < 10; i += 1) {
      expect(formatStoredMeasurement(stored, 'cm')).toBe('21.6 cm')
      expect(getDisplayInputString(stored, 'cm')).toBe('21.6')
      expect(getDisplayInputString(stored, 'in')).toBe('8 1/2')
      expect(stored.cm).toBeCloseTo(21.59, 5)
    }
  })

  it('allows blanks and rejects malformed, zero, negative, nonfinite, and tagged size inputs', () => {
    expect(parseMeasurementInput('   ', 'cm').kind).toBe('blank')
    expect(parseMeasurementInput('0', 'cm').kind).toBe('error')
    expect(parseMeasurementInput('-32', 'cm').kind).toBe('error')
    expect(parseMeasurementInput('NaN', 'cm').kind).toBe('error')
    expect(parseMeasurementInput('Infinity', 'cm').kind).toBe('error')
    expect(parseMeasurementInput('12 1/0', 'in').kind).toBe('error')
    expect(parseMeasurementInput('42..5', 'cm').kind).toBe('error')
    expect(parseMeasurementInput('abc', 'cm').kind).toBe('error')

    const tagRes = parseMeasurementInput('W32', 'in')
    expect(tagRes.kind).toBe('error')
    if (tagRes.kind === 'error') {
      expect(tagRes.error).toMatch(/Tagged sizes/i)
    }
  })

  it('halves explicit waist circumference with a visible conversion note', () => {
    const res = parseMeasurementInput('84', 'cm', { halveCircumference: true })
    expect(res.kind).toBe('valid')
    if (res.kind === 'valid') {
      expect(res.cm).toBe(42)
      expect(res.convention).toBe('circumference_halved')
      expect(res.conversionNote).toMatch(/Halved from 84 cm waistband circumference/i)
    }
  })
})

describe('Listing text parser fixtures', () => {
  it('Fixture 4: Tagged W32 L32, asking €95, hem 8 1/2 in -> only hem is proposed (21.59 cm internally, 21.6 cm display)', () => {
    const parsed = parseListingText(FIXTURE_TAGGED_AND_PRICE_TEXT)
    expect(parsed.proposals).toHaveLength(1)
    const hemProp = parsed.proposals[0]
    expect(hemProp.dimension).toBe('hem')
    expect(hemProp.rawNumber).toBe('8 1/2')
    expect(hemProp.detectedUnit).toBe('in')

    const resolved = resolveProposalToMeasurement(hemProp)
    expect(resolved.ok).toBe(true)
    if (resolved.ok) {
      expect(resolved.measurement.cm).toBeCloseTo(21.59, 5)
      expect(formatStoredMeasurement(resolved.measurement, 'cm')).toBe('21.6 cm')
    }
  })

  it('Fixture 5: Explicit 84 cm waistband circumference vs "waist 84"', () => {
    const explicit = parseListingText(FIXTURE_EXPLICIT_CIRCUMFERENCE_TEXT)
    expect(explicit.proposals).toHaveLength(1)
    const expProp = explicit.proposals[0]
    expect(expProp.dimension).toBe('waist')
    expect(expProp.needsUnitConfirmation).toBe(false)
    expect(expProp.needsConventionConfirmation).toBe(false)
    expect(expProp.waistConvention).toBe('circumference')

    const expResolved = resolveProposalToMeasurement(expProp)
    expect(expResolved.ok).toBe(true)
    if (expResolved.ok) {
      expect(expResolved.measurement.cm).toBe(42)
      expect(expResolved.measurement.conversionNote).toMatch(/Halved from 84 cm/i)
    }

    const ambiguous = parseListingText(FIXTURE_AMBIGUOUS_WAIST_TEXT)
    expect(ambiguous.proposals).toHaveLength(1)
    const ambProp = ambiguous.proposals[0]
    expect(ambProp.dimension).toBe('waist')
    expect(ambProp.needsUnitConfirmation).toBe(true)
    expect(ambProp.needsConventionConfirmation).toBe(true)

    // Cannot resolve until unit and convention are confirmed
    expect(resolveProposalToMeasurement(ambProp).ok).toBe(false)

    // Confirm unit = cm, still needs convention confirmation
    ambProp.selectedUnit = 'cm'
    expect(resolveProposalToMeasurement(ambProp).ok).toBe(false)

    // Confirm circumference convention -> resolves to 42 cm flat
    ambProp.waistConvention = 'circumference'
    const ambResolved = resolveProposalToMeasurement(ambProp)
    expect(ambResolved.ok).toBe(true)
    if (ambResolved.ok) {
      expect(ambResolved.measurement.cm).toBe(42)
    }
  })

  it('detects ranges, duplicate dimensions, bare numbers, and incompatible thigh methods', () => {
    const listing = `
      Flat waist: 41 - 42 cm
      Flat waist: 42.5 cm
      Thigh (at crotch): 33 cm
      Inseam: 31
    `
    const parsed = parseListingText(listing)
    const waistProposals = parsed.proposals.filter((p) => p.dimension === 'waist')
    expect(waistProposals).toHaveLength(2)
    expect(waistProposals[0].isRange).toBe(true)
    expect(waistProposals[0].valueOptions).toEqual(['41', '42'])
    expect(waistProposals[0].hasDuplicateDimension).toBe(true)
    expect(waistProposals[1].hasDuplicateDimension).toBe(true)

    const thighProp = parsed.proposals.find((p) => p.dimension === 'thigh')!
    expect(thighProp.convention).toBe('incompatible')

    const inseamProp = parsed.proposals.find((p) => p.dimension === 'inseam')!
    expect(inseamProp.needsUnitConfirmation).toBe(true)
  })

  it('parses synthetic OCR listing text ignoring tag size and price', () => {
    const parsed = parseListingText(SYNTHETIC_OCR_LISTING_TEXT)
    expect(parsed.proposals.map((p) => p.dimension)).toEqual([
      'waist',
      'thigh',
      'frontRise',
      'knee',
      'hem',
      'inseam',
    ])
  })
})

describe('Comparison rules, thresholds, and multi-candidate ranking fixtures', () => {
  it('Fixture 1: Reference 42/34/24 cm vs Candidate A 42/31/21 cm (Methods match)', () => {
    const ref = createExampleReferencePair()
    const candA = createExampleCandidateA()
    const result = compareCandidate(ref, candA, 'cm')

    expect(result.threeFieldScore?.totalAbsDeltaCm).toBe(6)
    expect(result.leadSummary).toContain('Waist similar.')
    expect(result.leadSummary).toContain(
      'Thigh and hem each 3 cm narrower laid flat.'
    )

    const thighRow = result.rows.find((r) => r.dimension === 'thigh')!
    expect(thighRow.explanationText).toBe('3 cm narrower laid flat at the thigh')
  })

  it('Fixture 2: Add B = 41.5, 33.5, 24 cm -> B is closest (total 1 cm); editing B hem to 17 cm -> total 8 cm, A becomes closest', () => {
    const ref = createExampleReferencePair()
    const candA = createExampleCandidateA()
    const candB = createExampleCandidateB()

    const ranking1 = rankCandidates(ref, [candA, candB], 'cm')
    expect(ranking1.isEligible).toBe(true)
    expect(ranking1.closestIds).toEqual([candB.id])
    expect(ranking1.entries[0].candidateName).toBe('Candidate B')
    expect(ranking1.entries[0].score.totalAbsDeltaCm).toBe(1)

    // Edit B's hem to 17 cm
    candB.measurements.hem = createStoredMeasurement('17', 'cm')!
    const ranking2 = rankCandidates(ref, [candA, candB], 'cm')
    expect(ranking2.isEligible).toBe(true)
    expect(ranking2.closestIds).toEqual([candA.id])
    const bEntry = ranking2.entries.find((e) => e.candidateId === candB.id)!
    expect(bEntry.score.totalAbsDeltaCm).toBe(8)
  })

  it('Fixture 3: Remove B thigh or mark it measured at the crotch -> ranking disappears and asks for thigh 2.5 cm below crotch', () => {
    const ref = createExampleReferencePair()
    const candA = createExampleCandidateA()
    const candB = createExampleCandidateB()

    // Case 3a: Remove B's thigh (blank is never treated as zero)
    delete candB.measurements.thigh
    const rankingRemoved = rankCandidates(ref, [candA, candB], 'cm')
    expect(rankingRemoved.isEligible).toBe(false)
    expect(rankingRemoved.missingDetails.join(' ')).toContain(
      'thigh width measured 2.5 cm below the crotch'
    )

    const compBRemoved = compareCandidate(ref, candB, 'cm')
    expect(compBRemoved.threeFieldScore).toBeUndefined()
    expect(compBRemoved.sellerQuestion).toContain(
      'thigh width measured 2.5 cm below the crotch'
    )

    // Case 3b: Mark B's thigh as measured at the crotch (incompatible)
    candB.measurements.thigh = createStoredMeasurement('33.5', 'cm', {
      convention: 'incompatible',
      conventionNote: 'Measured at crotch',
    })!
    const rankingIncompatible = rankCandidates(ref, [candA, candB], 'cm')
    expect(rankingIncompatible.isEligible).toBe(false)
    expect(rankingIncompatible.missingDetails.join(' ')).toContain(
      'thigh width measured 2.5 cm below the crotch'
    )
  })

  it('Fixture 6: Two identical candidates with mixed units and decimal comma produce a visible tie', () => {
    const ref = createExampleReferencePair() // 42, 34, 24 cm
    const cand1 = createExampleCandidateB() // 41.5, 33.5, 24 cm
    const cand2 = {
      id: 'cand-2',
      name: 'Candidate C (Mixed Units)',
      condition: 'washed_worn' as const,
      measurements: {
        waist: createStoredMeasurement('41,5', 'cm')!,
        thigh: createStoredMeasurement('33,5', 'cm')!,
        // 8 1/2 in = 21.59 cm; match cand1 hem to 8 1/2 in as well
        hem: createStoredMeasurement('8 1/2', 'in')!,
      },
    }
    cand1.measurements.hem = createStoredMeasurement('21.59', 'cm')!

    const ranking = rankCandidates(ref, [cand1, cand2], 'cm')
    expect(ranking.isEligible).toBe(true)
    expect(ranking.isTie).toBe(true)
    expect(ranking.closestIds).toEqual([cand1.id, cand2.id])
    expect(ranking.headline).toMatch(/Joint closest measurements \(tie\)/i)
  })

  it('evaluates threshold boundaries (<= 0.5 cm is similar) and rise/inseam direction terms', () => {
    expect(describeDimensionDelta('waist', -0.5).isSimilar).toBe(true)
    expect(describeDimensionDelta('waist', 0.5).isSimilar).toBe(true)
    expect(describeDimensionDelta('waist', -0.6).isSimilar).toBe(false)
    expect(describeDimensionDelta('frontRise', -1.5).phrase).toBe(
      '1.5 cm lower front rise'
    )
    expect(describeDimensionDelta('frontRise', 1.5).phrase).toBe(
      '1.5 cm higher front rise'
    )
    expect(describeDimensionDelta('inseam', -4).phrase).toBe(
      '4 cm shorter inseam'
    )
    expect(describeDimensionDelta('inseam', 4).phrase).toBe('4 cm longer inseam')
  })
})

describe('Safe local storage persistence', () => {
  it('recovers cleanly from malformed or older storage records and handles unavailable storage', () => {
    const fakeStore = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => fakeStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        fakeStore.set(k, v)
      },
      removeItem: (k: string) => {
        fakeStore.delete(k)
      },
    }

    fakeStore.set(STORAGE_KEY, '{malformed json')
    const malformedRes = loadPersistedState(mockStorage)
    expect(malformedRes.recoveredFromMalformed).toBe(true)
    expect(malformedRes.hasSavedData).toBe(false)

    // Save valid state
    const validState = {
      version: 1 as const,
      displayUnit: 'cm' as const,
      reference: createExampleReferencePair(),
      candidates: [createExampleCandidateA()],
    }
    expect(savePersistedState(validState, mockStorage)).toBe(true)
    const loadedRes = loadPersistedState(mockStorage)
    expect(loadedRes.hasSavedData).toBe(true)
    expect(loadedRes.state.reference.measurements.waist?.cm).toBe(42)

    // Unavailable storage that throws
    const throwingStorage = {
      getItem: () => {
        throw new Error('Quota / Private mode')
      },
    }
    const unavailableRes = loadPersistedState(throwingStorage)
    expect(unavailableRes.storageAvailable).toBe(false)
  })
})
