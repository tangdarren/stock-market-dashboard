import { useEffect, useMemo, useRef, useState } from 'react'
import { FadeContent } from '@/features/ui/components/FadeContent'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { ReplayIndicatorsPanel } from '@/features/replay/components/ReplayIndicatorsPanel'
import { ReplayLockedPrediction } from '@/features/replay/components/ReplayLockedPrediction'
import { ReplayOutcomeComparison } from '@/features/replay/components/ReplayOutcomeComparison'
import { ReplayPerformancePanel } from '@/features/replay/components/ReplayPerformancePanel'
import { ReplayPredictionForm } from '@/features/replay/components/ReplayPredictionForm'
import { ReplayPriceChart } from '@/features/replay/components/ReplayPriceChart'
import { ReplaySessionControls } from '@/features/replay/components/ReplaySessionControls'
import { ReplaySessionSummary } from '@/features/replay/components/ReplaySessionSummary'
import { ReplayStatusPanel } from '@/features/replay/components/ReplayStatusPanel'
import { ReplayWorkflowStepper } from '@/features/replay/components/ReplayWorkflowStepper'
import { buildReplayAttempt } from '@/features/replay/history'
import { useReplayHistory } from '@/features/replay/hooks/useReplayHistory'
import { useReplayPrediction } from '@/features/replay/hooks/useReplayPrediction'
import { useReplayResult } from '@/features/replay/hooks/useReplayResult'
import { useReplaySession } from '@/features/replay/hooks/useReplaySession'
import type { ReplaySessionRequest } from '@/features/replay/api/types'
import { isValidIsoDate, normalizeDateInput } from '@/features/replay/utils/dateValidation'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { BackendUnavailableError } from '@/lib/api/client'
import { usePageTitle } from '@/hooks/usePageTitle'

export function ReplayLabPage() {
  usePageTitle('Market Replay Lab')
  const { enabled: simulated } = useSimulatedDataMode()
  // Remount on mode change so session/prediction/history state cannot leak.
  return <ReplayLabPageContent key={simulated ? 'simulated' : 'live'} />
}

function ReplayLabPageContent() {
  // Load a random eligible session on first open.
  const [request, setRequest] = useState<ReplaySessionRequest>({
    kind: 'random',
    nonce: 0,
  })
  const [draftDate, setDraftDate] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const prediction = useReplayPrediction()
  const {
    phase,
    revealRequested,
    revealId,
    locked,
    draft,
    controlsFrozen,
    canLock,
    canCancel,
    canRestart,
    canReveal,
    reset,
    setHorizon,
    setDirection,
    setConfidence,
    lock,
    cancelLock,
    restart,
    requestReveal,
    markRevealed,
  } = prediction
  const sessionQuery = useReplaySession(request)
  const { summary, recent, recordAttempt, clear } = useReplayHistory()
  const recordedRevealIdsRef = useRef(new Set<string>())

  const selectedDate = sessionQuery.data?.available
    ? sessionQuery.data.selected_date
    : null

  // Request the result only after an explicit Reveal outcome action.
  const resultQuery = useReplayResult(selectedDate, {
    enabled: revealRequested,
  })

  useEffect(() => {
    if (
      revealRequested &&
      phase === 'locked' &&
      resultQuery.isSuccess &&
      resultQuery.data
    ) {
      markRevealed()
    }
  }, [
    revealRequested,
    phase,
    markRevealed,
    resultQuery.isSuccess,
    resultQuery.data,
  ])

  // Persist one completed attempt per reveal session after a successful outcome.
  useEffect(() => {
    if (phase !== 'revealed' || !locked || !revealId || !selectedDate) return
    const result = resultQuery.data
    if (!result?.available) return
    const outcome = locked.horizon === 1 ? result.one_day : result.five_day
    if (!outcome) return
    if (recordedRevealIdsRef.current.has(revealId)) return

    const attempt = buildReplayAttempt({
      id: revealId,
      replayDate: selectedDate,
      prediction: locked,
      outcome,
    })
    const appendResult = recordAttempt(attempt)
    if (appendResult.status === 'added' || appendResult.status === 'duplicate') {
      recordedRevealIdsRef.current.add(revealId)
    }
  }, [
    phase,
    locked,
    revealId,
    selectedDate,
    resultQuery.data,
    recordAttempt,
  ])

  const serverDate =
    sessionQuery.data?.available && sessionQuery.data.selected_date
      ? sessionQuery.data.selected_date
      : null
  const dateInput = editingDate ? draftDate : (serverDate ?? draftDate)

  const resetPredictionWorkflow = () => {
    reset()
  }

  const loadByDate = (rawDate: string) => {
    const date = normalizeDateInput(rawDate)
    if (!isValidIsoDate(date)) {
      setClientError('Enter a valid date as YYYY-MM-DD.')
      return
    }
    setClientError(null)
    setDraftDate(date)
    setEditingDate(false)
    resetPredictionWorkflow()
    setRequest((prev) => ({ kind: 'date', date, nonce: prev.nonce + 1 }))
  }

  const loadRandom = () => {
    setClientError(null)
    setDraftDate('')
    setEditingDate(false)
    resetPredictionWorkflow()
    setRequest((prev) => ({ kind: 'random', nonce: prev.nonce + 1 }))
  }

  const retry = () => {
    setClientError(null)
    resetPredictionWorkflow()
    setRequest((prev) =>
      prev.kind === 'date'
        ? { kind: 'date', date: prev.date, nonce: prev.nonce + 1 }
        : { kind: 'random', nonce: prev.nonce + 1 },
    )
  }

  const session = sessionQuery.data
  const backendUnavailable = sessionQuery.error instanceof BackendUnavailableError
  const isBusy = sessionQuery.isLoading || sessionQuery.isFetching
  const showLoadingPanel = isBusy && !session?.available
  const showStatusPanel =
    showLoadingPanel ||
    Boolean(clientError) ||
    backendUnavailable ||
    Boolean(sessionQuery.error) ||
    Boolean(session && !session.available)

  const eligibleMin = session?.min_eligible_date ?? null
  const eligibleMax = session?.max_eligible_date ?? null

  const methodologySummary = useMemo(
    () => session?.methodology?.summary ?? null,
    [session?.methodology?.summary],
  )

  const resultLoading = resultQuery.isLoading || resultQuery.isFetching
  const showOutcomePanel =
    revealRequested &&
    (phase === 'locked' || phase === 'revealed') &&
    locked

  return (
    <div className="min-h-screen overflow-x-hidden pt-28 pb-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <FadeContent>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
            Educational forecasting exercise
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Market Replay Lab
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-400">
            Review a historical SPY session using only information available through that
            date, lock a directional forecast, then reveal the model’s out-of-sample
            walk-forward prediction and the realized outcome.
          </p>
        </FadeContent>

        <FadeContent className="mt-10">
          <GlassCard className="p-6 sm:p-8">
            <ReplaySessionControls
              dateInput={dateInput}
              onDateChange={(value) => {
                setEditingDate(true)
                setDraftDate(value)
                if (clientError) setClientError(null)
              }}
              onLoadSession={() => loadByDate(dateInput)}
              onRandomSession={loadRandom}
              isLoading={isBusy}
              minEligibleDate={eligibleMin}
              maxEligibleDate={eligibleMax}
            />
          </GlassCard>
        </FadeContent>

        {showStatusPanel ? (
          <FadeContent className="mt-6">
            <ReplayStatusPanel
              isLoading={showLoadingPanel}
              backendUnavailable={backendUnavailable}
              clientError={clientError}
              unavailableReason={session && !session.available ? session.reason : null}
              unavailableDetail={session && !session.available ? session.detail : null}
              nearestBefore={session?.nearest_eligible_before}
              nearestAfter={session?.nearest_eligible_after}
              errorMessage={
                sessionQuery.error && !backendUnavailable
                  ? sessionQuery.error.message
                  : null
              }
              onRetry={retry}
              onSelectNearby={loadByDate}
            />
          </FadeContent>
        ) : null}

        {session?.available && selectedDate ? (
          <FadeContent className="mt-6 space-y-6">
            <GlassCard className="p-6 sm:p-8">
              <ReplayWorkflowStepper phase={phase} />
            </GlassCard>

            <GlassCard className="p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-white">Selected session</h2>
              <p className="mt-2 text-sm text-slate-400">
                Data available through{' '}
                <span className="font-medium text-slate-200">{selectedDate}</span>. Pre-reveal
                market context only — no model probabilities or future outcomes.
              </p>
              <div className="mt-6">
                <ReplaySessionSummary session={session} />
              </div>
            </GlassCard>

            <ReplayPriceChart series={session.series} selectedDate={selectedDate} />

            <GlassCard className="p-6 sm:p-8">
              <ReplayIndicatorsPanel
                indicators={session.indicators}
                selectedDate={selectedDate}
              />
              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Every chart point and indicator above is engineered from prices and volume
                on or before {selectedDate}. Nothing after that session is included.
              </p>
            </GlassCard>

            <GlassCard className="p-6 sm:p-8 space-y-6">
              <ReplayPredictionForm
                draft={draft}
                frozen={controlsFrozen}
                canLock={canLock}
                onHorizonChange={setHorizon}
                onDirectionChange={setDirection}
                onConfidenceChange={setConfidence}
                onLock={lock}
              />

              {locked && (phase === 'locked' || phase === 'revealed') ? (
                <ReplayLockedPrediction
                  prediction={locked}
                  revealRequested={revealRequested}
                  isResultLoading={resultLoading}
                  canCancel={canCancel && phase === 'locked'}
                  canRestart={canRestart}
                  canReveal={canReveal}
                  onReveal={requestReveal}
                  onCancel={cancelLock}
                  onRestart={restart}
                />
              ) : null}

              {showOutcomePanel && locked ? (
                <ReplayOutcomeComparison
                  prediction={locked}
                  result={resultQuery.data}
                  isLoading={resultLoading}
                  isError={resultQuery.isError}
                  errorMessage={
                    resultQuery.error instanceof Error
                      ? resultQuery.error.message
                      : null
                  }
                  onRetry={() => {
                    void resultQuery.refetch()
                  }}
                  onRestart={restart}
                />
              ) : null}
            </GlassCard>

            {methodologySummary ? (
              <GlassCard className="p-6 sm:p-8">
                <h2 className="text-lg font-semibold text-white">How replay works</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {methodologySummary}
                </p>
                {session.disclaimer ? (
                  <p className="mt-4 text-xs leading-relaxed text-slate-600">
                    {session.disclaimer}
                  </p>
                ) : null}
              </GlassCard>
            ) : null}
          </FadeContent>
        ) : null}

        <FadeContent className="mt-6">
          <GlassCard className="p-6 sm:p-8">
            <ReplayPerformancePanel
              summary={summary}
              recent={recent}
              onClear={clear}
            />
          </GlassCard>
        </FadeContent>
      </div>
    </div>
  )
}
