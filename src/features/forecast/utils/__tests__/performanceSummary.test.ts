import { buildPerformanceSummary } from '../performanceSummary'
import type { HorizonMetrics, HoldoutMetrics } from '../../api/types'

function mkHoldout(accuracy: number, balanced: number): HoldoutMetrics {
  return {
    n_observations: 200,
    test_period_start: '2022-01-03',
    test_period_end: '2023-01-01',
    class_distribution: { class_0: 90, class_1: 110 },
    accuracy,
    balanced_accuracy: balanced,
    precision_up: 0.55,
    recall_up: 0.6,
    f1_up: 0.575,
    brier: 0.246,
    roc_auc: 0.55,
    confusion_matrix: [[40, 50], [30, 80]],
  }
}

function mkMetrics(model: HoldoutMetrics, majority: HoldoutMetrics, persistence: HoldoutMetrics): HorizonMetrics {
  return {
    selected_model: 'logistic_regression',
    model_comparison: [],
    baselines: { majority_class: majority, persistence },
    holdout: model,
    yearly: [],
    confidence_buckets: [],
    calibration: [],
    backtest: { available: false },
  }
}

describe('buildPerformanceSummary', () => {
  it('flags the model as beating baselines when balanced accuracy is >= 1pp better', () => {
    const s = buildPerformanceSummary(
      mkMetrics(mkHoldout(0.58, 0.57), mkHoldout(0.53, 0.5), mkHoldout(0.51, 0.505)),
    )!
    expect(s.verdict).toBe('beats')
    expect(s.headline).toMatch(/outperformed/i)
  })

  it('flags the model as roughly matching baselines when balanced acc is within noise', () => {
    const s = buildPerformanceSummary(
      mkMetrics(mkHoldout(0.535, 0.505), mkHoldout(0.53, 0.5), mkHoldout(0.51, 0.5)),
    )!
    expect(s.verdict).toBe('matches')
    expect(s.headline).toMatch(/similarly/i)
  })

  it('flags the model as weak when balanced accuracy is meaningfully below baseline', () => {
    const s = buildPerformanceSummary(
      mkMetrics(mkHoldout(0.5, 0.48), mkHoldout(0.53, 0.52), mkHoldout(0.51, 0.505)),
    )!
    expect(s.verdict).toBe('weak')
    expect(s.headline).toMatch(/underperformed/i)
  })

  it('returns null for missing horizon metrics', () => {
    expect(buildPerformanceSummary(undefined)).toBeNull()
  })
})
