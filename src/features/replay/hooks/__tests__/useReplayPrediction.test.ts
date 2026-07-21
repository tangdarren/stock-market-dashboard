import { describe, expect, it } from 'vitest'
import {
  replayPredictionInitialState,
  replayPredictionReducer,
} from '../useReplayPrediction'

describe('replayPredictionReducer', () => {
  it('starts in reviewing with no reveal request', () => {
    expect(replayPredictionInitialState.phase).toBe('reviewing')
    expect(replayPredictionInitialState.revealRequested).toBe(false)
    expect(replayPredictionInitialState.locked).toBeNull()
  })

  it('moves to configuring when the draft changes', () => {
    const next = replayPredictionReducer(replayPredictionInitialState, {
      type: 'set_horizon',
      horizon: 1,
    })
    expect(next.phase).toBe('configuring')
    expect(next.draft.horizon).toBe(1)
    expect(next.revealRequested).toBe(false)
  })

  it('does not lock an incomplete prediction', () => {
    const configuring = replayPredictionReducer(replayPredictionInitialState, {
      type: 'set_horizon',
      horizon: 1,
    })
    const lockedAttempt = replayPredictionReducer(configuring, { type: 'lock' })
    expect(lockedAttempt.phase).toBe('configuring')
    expect(lockedAttempt.locked).toBeNull()
    expect(lockedAttempt.revealRequested).toBe(false)
  })

  it('locks a complete prediction without requesting the result', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 1 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'up' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 70 })
    state = replayPredictionReducer(state, { type: 'lock' })

    expect(state.phase).toBe('locked')
    expect(state.locked).toEqual({
      horizon: 1,
      direction: 'up',
      confidence: 70,
      probUp: 0.7,
    })
    expect(state.revealRequested).toBe(false)
  })

  it('freezes draft edits after lock', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 1 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'up' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 70 })
    state = replayPredictionReducer(state, { type: 'lock' })
    const afterEdit = replayPredictionReducer(state, {
      type: 'set_direction',
      direction: 'down',
    })

    expect(afterEdit).toEqual(state)
    expect(afterEdit.locked?.direction).toBe('up')
  })

  it('requests reveal only through an explicit action', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 5 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'down' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 80 })
    state = replayPredictionReducer(state, { type: 'lock' })
    expect(state.revealRequested).toBe(false)

    state = replayPredictionReducer(state, { type: 'request_reveal' })
    expect(state.revealRequested).toBe(true)
    expect(state.phase).toBe('locked')
    expect(state.locked?.probUp).toBeCloseTo(0.2)
  })

  it('marks revealed only after a reveal was requested', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 1 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'up' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 60 })
    state = replayPredictionReducer(state, { type: 'lock' })

    const premature = replayPredictionReducer(state, { type: 'mark_revealed' })
    expect(premature.phase).toBe('locked')

    state = replayPredictionReducer(state, { type: 'request_reveal' })
    state = replayPredictionReducer(state, { type: 'mark_revealed' })
    expect(state.phase).toBe('revealed')
    expect(state.locked).not.toBeNull()
  })

  it('cancels a lock without dropping the draft', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 1 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'up' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 55 })
    state = replayPredictionReducer(state, { type: 'lock' })
    state = replayPredictionReducer(state, { type: 'cancel_lock' })

    expect(state.phase).toBe('configuring')
    expect(state.locked).toBeNull()
    expect(state.revealRequested).toBe(false)
    expect(state.draft).toEqual({
      horizon: 1,
      direction: 'up',
      confidence: 55,
    })
  })

  it('restarts clears prediction, lock, and reveal request', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 1 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'up' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 90 })
    state = replayPredictionReducer(state, { type: 'lock' })
    state = replayPredictionReducer(state, { type: 'request_reveal' })
    state = replayPredictionReducer(state, { type: 'mark_revealed' })
    state = replayPredictionReducer(state, { type: 'restart' })

    expect(state).toEqual({
      phase: 'configuring',
      draft: { horizon: null, direction: null, confidence: null },
      locked: null,
      revealRequested: false,
    })
  })

  it('reset returns to the initial reviewing state', () => {
    let state = replayPredictionInitialState
    state = replayPredictionReducer(state, { type: 'set_horizon', horizon: 5 })
    state = replayPredictionReducer(state, { type: 'set_direction', direction: 'down' })
    state = replayPredictionReducer(state, { type: 'set_confidence', confidence: 70 })
    state = replayPredictionReducer(state, { type: 'lock' })
    state = replayPredictionReducer(state, { type: 'request_reveal' })
    state = replayPredictionReducer(state, { type: 'reset' })

    expect(state).toEqual(replayPredictionInitialState)
  })
})
