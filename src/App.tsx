import { useEffect, useState } from 'react'
import { CandidateListingSection } from './components/CandidateListingSection'
import { FitResultsSection } from './components/FitResultsSection'
import { ReferencePairSection } from './components/ReferencePairSection'
import { SampleResultPreview } from './components/SampleResultPreview'
import { WebsiteFooter } from './components/WebsiteFooter'
import {
  createEmptyCandidate,
  createExampleCandidateB,
  createExampleState,
} from './domain/fixtures'
import {
  clearPersistedState,
  createInitialUserState,
  loadPersistedState,
  savePersistedState,
} from './domain/storage'
import type {
  AppPersistedState,
  CandidateListing,
  ReferencePair,
  Unit,
} from './domain/types'

type FlowStep = 'reference' | 'listings' | 'results'

export function App() {
  const [initialLoad] = useState(() => loadPersistedState())
  const [userState, setUserState] = useState<AppPersistedState>(
    () => initialLoad.state
  )
  const [exampleState, setExampleState] = useState<AppPersistedState>(() =>
    createExampleState()
  )
  const [isExampleMode, setIsExampleMode] = useState<boolean>(false)
  const [activeStep, setActiveStep] = useState<FlowStep>('reference')
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0)
  const [storageNotice, setStorageNotice] = useState<string | undefined>(() => {
    if (!initialLoad.storageAvailable) {
      return 'Local storage is unavailable in this browser session. Running an in-memory comparison.'
    }
    if (initialLoad.recoveredFromMalformed) {
      return 'Recovered from an older or malformed saved record. Starting a fresh comparison.'
    }
    return undefined
  })
  // Bumped on "Clear saved data" or mode reset to clear transient input drafts cleanly
  const [resetGeneration, setResetGeneration] = useState<number>(1)

  // Save userState automatically whenever it changes (never save exampleState!)
  useEffect(() => {
    savePersistedState(userState)
  }, [userState])

  const activeState = isExampleMode ? exampleState : userState

  const updateActiveState = (
    updater: (prev: AppPersistedState) => AppPersistedState
  ) => {
    if (isExampleMode) {
      setExampleState(updater)
    } else {
      setUserState(updater)
    }
  }

  const handleSetDisplayUnit = (unit: Unit) => {
    // Toggling display unit changes how values are displayed without mutating stored canonical cm
    updateActiveState((prev) => ({
      ...prev,
      displayUnit: unit,
    }))
  }

  const handleTryExample = () => {
    setExampleState(createExampleState())
    setIsExampleMode(true)
    setActiveCandidateIndex(0)
    setActiveStep('results')
  }

  const handleCompareMyJeans = () => {
    setIsExampleMode(false)
    setActiveCandidateIndex(0)
    setActiveStep('reference')
  }

  const handleUpdateReference = (nextRef: ReferencePair) => {
    updateActiveState((prev) => ({
      ...prev,
      reference: nextRef,
    }))
  }

  const handleUpdateCandidate = (index: number, nextCand: CandidateListing) => {
    updateActiveState((prev) => {
      const nextCandidates = [...prev.candidates]
      nextCandidates[index] = nextCand
      return {
        ...prev,
        candidates: nextCandidates,
      }
    })
  }

  const handleAddCandidate = () => {
    if (activeState.candidates.length >= 3) return
    const newIndex = activeState.candidates.length
    updateActiveState((prev) => {
      if (prev.candidates.length >= 3) return prev
      return {
        ...prev,
        candidates: [...prev.candidates, createEmptyCandidate(prev.candidates.length)],
      }
    })
    setActiveCandidateIndex(newIndex)
  }

  const handleAddExampleCandidateB = () => {
    if (activeState.candidates.length >= 3) return
    const newIndex = activeState.candidates.length
    updateActiveState((prev) => {
      if (prev.candidates.length >= 3) return prev
      return {
        ...prev,
        candidates: [...prev.candidates, createExampleCandidateB()],
      }
    })
    setActiveCandidateIndex(newIndex)
  }

  const handleRemoveCandidate = (index: number) => {
    if (activeState.candidates.length <= 1) return
    updateActiveState((prev) => {
      if (prev.candidates.length <= 1) return prev
      const nextCandidates = prev.candidates.filter((_, idx) => idx !== index)
      return {
        ...prev,
        candidates: nextCandidates,
      }
    })
    setActiveCandidateIndex((prevIdx) => Math.max(0, Math.min(prevIdx, activeState.candidates.length - 2)))
  }

  const handleStartNewComparisonKeepRef = () => {
    updateActiveState((prev) => ({
      ...prev,
      candidates: [createEmptyCandidate(0, `candidate-a-${Date.now()}`)],
    }))
    setActiveCandidateIndex(0)
    setActiveStep('listings')
  }

  const handleClearSavedData = () => {
    clearPersistedState()
    const fresh = createInitialUserState()
    setUserState(fresh)
    setIsExampleMode(false)
    setActiveCandidateIndex(0)
    setActiveStep('reference')
    setResetGeneration((g) => g + 1)
    setStorageNotice('Saved data cleared from this device.')
  }

  const navigateToStep = (step: FlowStep) => {
    setActiveStep(step)
    const sectionIdMap: Record<FlowStep, string> = {
      reference: 'ref-section-heading',
      listings: 'listings-section-heading',
      results: 'results-section-heading',
    }
    const el = document.getElementById(sectionIdMap[step])
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const safeCandidateIndex = Math.min(
    activeCandidateIndex,
    Math.max(0, activeState.candidates.length - 1)
  )

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-top-row">
          <div className="brand-title-group">
            <h1>Denim Fit Check</h1>
            <p className="brand-subtitle">
              Second-hand Japanese denim comparator
            </p>
          </div>

          <div className="header-controls">
            <div
              className="unit-toggle-group"
              role="group"
              aria-label="Display measurement units"
            >
              <span className="unit-toggle-label">Units:</span>
              <button
                type="button"
                id="unit-toggle-cm"
                data-testid="unit-toggle-cm"
                aria-pressed={activeState.displayUnit === 'cm'}
                className={`unit-toggle-btn ${activeState.displayUnit === 'cm' ? 'active' : ''}`}
                onClick={() => handleSetDisplayUnit('cm')}
              >
                cm
              </button>
              <button
                type="button"
                id="unit-toggle-in"
                data-testid="unit-toggle-in"
                aria-pressed={activeState.displayUnit === 'in'}
                className={`unit-toggle-btn ${activeState.displayUnit === 'in' ? 'active' : ''}`}
                onClick={() => handleSetDisplayUnit('in')}
              >
                in
              </button>
            </div>
          </div>
        </div>

        <div className="mode-action-bar">
          <div className="mode-primary-actions">
            <button
              type="button"
              id="header-btn-compare-my-jeans"
              data-testid="header-btn-compare-my-jeans"
              className={`btn btn-sm ${!isExampleMode ? 'btn-primary' : ''}`}
              onClick={handleCompareMyJeans}
            >
              Compare my jeans
            </button>
            <button
              type="button"
              id="header-btn-try-example"
              data-testid="header-btn-try-example"
              className={`btn btn-sm ${isExampleMode ? 'btn-primary' : 'btn-accent'}`}
              onClick={handleTryExample}
            >
              Try an example
            </button>
          </div>

          <div className="mode-utility-actions">
            <button
              type="button"
              id="btn-new-comparison-keep-ref"
              data-testid="btn-new-comparison-keep-ref"
              className="btn btn-sm"
              onClick={handleStartNewComparisonKeepRef}
            >
              New comparison (keep reference)
            </button>
            <button
              type="button"
              id="btn-clear-saved-data"
              data-testid="btn-clear-saved-data"
              className="btn btn-sm btn-danger"
              onClick={handleClearSavedData}
            >
              Clear saved data
            </button>
          </div>
        </div>

        {storageNotice && (
          <div
            data-testid="storage-status-notice"
            style={{
              marginTop: '10px',
              fontSize: '0.8rem',
              padding: '6px 10px',
              borderRadius: '4px',
              background: 'var(--bg-subtle)',
              color: 'var(--ink-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <span>{storageNotice}</span>
            <button
              type="button"
              className="btn btn-sm"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => setStorageNotice(undefined)}
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      {/* Immediate Sample Result on Home so first-time visitors understand why to measure */}
      <SampleResultPreview
        isExampleMode={isExampleMode}
        onCompareMyJeans={handleCompareMyJeans}
        onTryExample={handleTryExample}
      />

      {/* Example Mode Isolation Banner */}
      {isExampleMode && (
        <div
          className="example-mode-banner"
          data-testid="example-mode-banner"
          role="status"
        >
          <p>
            <strong>Example Mode (temporary state):</strong> You are exploring a
            sample comparison (Reference 42 / 34 / 24 cm vs Candidate A 42 / 31 /
            21 cm). Try editing measurements or adding Candidate B—your saved
            reference pair on this device is never overwritten.
          </p>
          <button
            type="button"
            data-testid="btn-exit-example"
            className="btn btn-sm"
            onClick={handleCompareMyJeans}
          >
            Return to my saved jeans
          </button>
        </div>
      )}

      {/* Compact Mobile Flow Step Bar: Reference -> Listing Review -> Results */}
      <nav
        className="mobile-flow-nav"
        aria-label="Comparison workflow steps"
        data-testid="mobile-flow-nav"
      >
        <button
          type="button"
          id="flow-tab-reference"
          data-testid="flow-tab-reference"
          className={`flow-step-btn ${activeStep === 'reference' ? 'active' : ''}`}
          onClick={() => navigateToStep('reference')}
        >
          1. Reference
        </button>
        <button
          type="button"
          id="flow-tab-listings"
          data-testid="flow-tab-listings"
          className={`flow-step-btn ${activeStep === 'listings' ? 'active' : ''}`}
          onClick={() => navigateToStep('listings')}
        >
          2. Listing Review ({activeState.candidates.length})
        </button>
        <button
          type="button"
          id="flow-tab-results"
          data-testid="flow-tab-results"
          className={`flow-step-btn ${activeStep === 'results' ? 'active' : ''}`}
          onClick={() => navigateToStep('results')}
        >
          3. Fit Results
        </button>
      </nav>

      <main key={`${isExampleMode ? 'example' : 'user'}-${resetGeneration}`}>
        <ReferencePairSection
          reference={activeState.reference}
          displayUnit={activeState.displayUnit}
          onUpdateReference={handleUpdateReference}
          onNextStep={() => navigateToStep('listings')}
        />

        <CandidateListingSection
          candidates={activeState.candidates}
          activeCandidateIndex={safeCandidateIndex}
          displayUnit={activeState.displayUnit}
          isExampleMode={isExampleMode}
          onSelectCandidate={setActiveCandidateIndex}
          onUpdateCandidate={handleUpdateCandidate}
          onAddCandidate={handleAddCandidate}
          onAddExampleCandidateB={handleAddExampleCandidateB}
          onRemoveCandidate={handleRemoveCandidate}
          onBackStep={() => navigateToStep('reference')}
          onNextStep={() => navigateToStep('results')}
        />

        <FitResultsSection
          reference={activeState.reference}
          candidates={activeState.candidates}
          activeCandidateIndex={safeCandidateIndex}
          displayUnit={activeState.displayUnit}
          onSelectCandidate={setActiveCandidateIndex}
          onBackToListings={() => navigateToStep('listings')}
          onStartNewComparisonKeepRef={handleStartNewComparisonKeepRef}
        />
      </main>

      <WebsiteFooter />
    </div>
  )
}

export default App
