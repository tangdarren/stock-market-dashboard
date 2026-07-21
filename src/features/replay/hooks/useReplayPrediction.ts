import { useCallback, useReducer } from 'react'
import type { ReplayDirection } from '../api/types'
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
}

type Action =
  | { type: 'reset' }
  | { type: 'set_horizon'; horizon: ReplayForecastHorizon }
  | { type: 'set_direction'; direction: ReplayDirection }
  | { type: 'set_confidence'; confidence: number }
  | { type: 'lock' }
  | { type: 'cancel_lock' }
  | { type: 'restart' }
  | { type: 'request_reveal' }
  | { type: 'mark_revealed' }

const initialState: ReplayPredictionState = {
  phase: 'reviewing',
  draft: EMPTY_PREDICTION_DRAFT,
  locked: null,
  revealRequested: false,
}

function reduce(state: ReplayPredictionState, action: Action): ReplayPredictionState {
  switch (action.type) {
    case 'reset':
      return initialState

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
      }
    }

    case 'request_reveal': {
      if (state.phase !== 'locked' || !state.locked) return state
      return {
        ...state,
        revealRequested: true,
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
  const requestReveal = useCallback(() => dispatch({ type: 'request_reveal' }), [])
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
