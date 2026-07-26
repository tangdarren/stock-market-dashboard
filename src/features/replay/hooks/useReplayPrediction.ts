import { useCallback, useReducer } from 'react'
import type { ReplayDirection } from '../api/types'
import { createAttemptId } from '../history/buildAttempt'
import {
  EMPTY_PREDICTION_DRAFT,
  lockPrediction,
  type LockedReplayPrediction,
  type ReplayForecastHorizon,
  type ReplayPredictionDraft,
  type ReplayWorkflowPhase,
} from '../utils/prediction'

export interface ReplayPredictionState {
  phase: ReplayWorkflowPhase
  draft: ReplayPredictionDraft
  locked: LockedReplayPrediction | null
  /** When true, the result endpoint may be requested. */
  revealRequested: boolean
  /**
   * Stable id for the current reveal session. Used as the history attempt id
   * so Strict Mode, rerenders, and repeated result responses cannot double-save.
   */
  revealId: string | null
}

type Action =
  | { type: 'reset' }
  | { type: 'begin_configuring' }
  | { type: 'set_horizon'; horizon: ReplayForecastHorizon }
  | { type: 'set_direction'; direction: ReplayDirection }
  | { type: 'set_confidence'; confidence: number }
  | { type: 'lock' }
  | { type: 'cancel_lock' }
  | { type: 'restart' }
  | { type: 'request_reveal'; revealId?: string }
  | { type: 'mark_revealed' }

const initialState: ReplayPredictionState = {
  phase: 'reviewing',
  draft: EMPTY_PREDICTION_DRAFT,
  locked: null,
  revealRequested: false,
  revealId: null,
}

function reduce(state: ReplayPredictionState, action: Action): ReplayPredictionState {
  switch (action.type) {
    case 'reset':
      return initialState

    case 'begin_configuring': {
      if (state.phase !== 'reviewing') return state
      return {
        ...state,
        phase: 'configuring',
      }
    }

    case 'set_horizon': {
      if (state.phase === 'locked' || state.phase === 'revealed') return state
      return {
        ...state,
        phase: 'configuring',
        draft: { ...state.draft, horizon: action.horizon },
      }
    }

    case 'set_direction': {
      if (state.phase === 'locked' || state.phase === 'revealed') return state
      return {
        ...state,
        phase: 'configuring',
        draft: { ...state.draft, direction: action.direction },
      }
    }

    case 'set_confidence': {
      if (state.phase === 'locked' || state.phase === 'revealed') return state
      return {
        ...state,
        phase: 'configuring',
        draft: { ...state.draft, confidence: action.confidence },
      }
    }

    case 'lock': {
      if (state.phase === 'locked' || state.phase === 'revealed') return state
      const locked = lockPrediction(state.draft)
      if (!locked) return state
      return {
        ...state,
        phase: 'locked',
        locked,
        revealRequested: false,
        revealId: null,
      }
    }

    case 'cancel_lock': {
      // Allowed while locked (including after a failed reveal) so the learner
      // can revise. UI should disable this while a result request is in flight.
      if (state.phase !== 'locked') return state
      return {
        ...state,
        phase: 'configuring',
        locked: null,
        revealRequested: false,
        revealId: null,
      }
    }

    case 'restart': {
      // Allowed while locked (before or during result fetch) or after reveal.
      if (state.phase !== 'locked' && state.phase !== 'revealed') return state
      return {
        phase: 'configuring',
        draft: EMPTY_PREDICTION_DRAFT,
        locked: null,
        revealRequested: false,
        revealId: null,
      }
    }

    case 'request_reveal': {
      if (state.phase !== 'locked' || !state.locked) return state
      // Keep the existing revealId when reveal was already requested (retries).
      if (state.revealRequested) {
        return state
      }
      return {
        ...state,
        revealRequested: true,
        revealId: action.revealId ?? state.revealId ?? createAttemptId(),
      }
    }

    case 'mark_revealed': {
      if (!state.revealRequested || !state.locked) return state
      return {
        ...state,
        phase: 'revealed',
      }
    }

    default:
      return state
  }
}

export function useReplayPrediction() {
  const [state, dispatch] = useReducer(reduce, initialState)

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const beginConfiguring = useCallback(
    () => dispatch({ type: 'begin_configuring' }),
    [],
  )
  const setHorizon = useCallback(
    (horizon: ReplayForecastHorizon) => dispatch({ type: 'set_horizon', horizon }),
    [],
  )
  const setDirection = useCallback(
    (direction: ReplayDirection) => dispatch({ type: 'set_direction', direction }),
    [],
  )
  const setConfidence = useCallback(
    (confidence: number) => dispatch({ type: 'set_confidence', confidence }),
    [],
  )
  const lock = useCallback(() => dispatch({ type: 'lock' }), [])
  const cancelLock = useCallback(() => dispatch({ type: 'cancel_lock' }), [])
  const restart = useCallback(() => dispatch({ type: 'restart' }), [])
  const requestReveal = useCallback(
    () => dispatch({ type: 'request_reveal', revealId: createAttemptId() }),
    [],
  )
  const markRevealed = useCallback(() => dispatch({ type: 'mark_revealed' }), [])

  const canLock =
    (state.phase === 'reviewing' || state.phase === 'configuring') &&
    state.draft.horizon != null &&
    state.draft.direction != null &&
    state.draft.confidence != null

  const controlsFrozen = state.phase === 'locked' || state.phase === 'revealed'
  const canCancel = state.phase === 'locked'
  const canRestart = state.phase === 'locked' || state.phase === 'revealed'
  const canReveal =
    state.phase === 'locked' && Boolean(state.locked) && !state.revealRequested

  return {
    ...state,
    canLock,
    controlsFrozen,
    canCancel,
    canRestart,
    canReveal,
    reset,
    beginConfiguring,
    setHorizon,
    setDirection,
    setConfidence,
    lock,
    cancelLock,
    restart,
    requestReveal,
    markRevealed,
  }
}

/** Pure reducer export for focused unit tests. */
export { reduce as replayPredictionReducer, initialState as replayPredictionInitialState }
export type { Action as ReplayPredictionAction }
