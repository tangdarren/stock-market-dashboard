import { usePageTitle } from '@/hooks/usePageTitle'
import { FadeContent } from '@/features/ui/components/FadeContent'
import CardSwap, { Card } from '@/features/ui/components/CardSwap'
import '@/styles/card-swap.css'

const lessons = [
  {
    number: '01',
    title: 'Candlestick Basics',
    description:
      'Candlesticks encode four data points — open, high, low, close — into a single visual. Green means the close was above the open. Red means it closed below. Learn to read them and you can read the market.',
    tip: 'A long wick means the price was rejected at that level.',
  },
  {
    number: '02',
    title: 'Support & Resistance',
    description:
      'Support is a price floor where buyers step in. Resistance is a ceiling where sellers take control. These levels form because traders have memory — the market tends to react at the same prices repeatedly.',
    tip: 'The more times a level is tested, the more significant it becomes.',
  },
  {
    number: '03',
    title: 'Risk Management',
    description:
      'Never risk more than 1–2% of your account on a single trade. Use stop losses. Size your positions based on the distance to your stop, not on how confident you feel. Survival is the first edge.',
    tip: 'A 50% loss requires a 100% gain to recover. Protect your capital.',
  },
  {
    number: '04',
    title: 'Reading Trends',
    description:
      'An uptrend makes higher highs and higher lows. A downtrend makes lower highs and lower lows. Trade in the direction of the trend until the structure breaks. Fighting the trend is how most accounts bleed out.',
    tip: 'Use moving averages (20, 50, 200) to confirm the trend direction.',
  },
  {
    number: '05',
    title: 'Volume Analysis',
    description:
      'Volume confirms price moves. A breakout on high volume is more likely to hold than one on low volume. When price rises but volume falls, the move is losing conviction. Volume is the fuel behind every move.',
    tip: 'Watch for volume spikes at key levels — they signal institutional interest.',
  },
]

export function LearnPage() {
  usePageTitle('Learn')

  return (
    <div className="min-h-screen pt-28 pb-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeContent>
          <div className="lg:-translate-x-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
              Learn the Fundamentals
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Trading Essentials
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-400">
              Master the core concepts that every serious trader needs to
              understand before risking real capital.
            </p>
          </div>
        </FadeContent>

        <div className="mt-6 flex flex-col items-center lg:-translate-x-8 lg:flex-row lg:items-start lg:gap-16">
          <FadeContent className="w-full lg:w-1/2">
            <div className="space-y-4">
              {lessons.map((lesson) => (
                <div
                  key={lesson.number}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-green-500/20 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start gap-4">
                    <span className="shrink-0 text-xs font-bold text-green-400/60">
                      {lesson.number}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {lesson.title}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        {lesson.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </FadeContent>

          <FadeContent className="relative mt-16 lg:-mt-32 lg:w-1/2">
            <div style={{ height: '624px', position: 'relative' }}>
              <CardSwap
                cardDistance={60}
                verticalDistance={66}
                delay={1500}
                pauseOnHover={true}
                width={456}
                height={528}
                skewAmount={4}
                easing="elastic"
              >
                {lessons.map((lesson) => (
                  <Card key={lesson.number}>
                    <div className="flex h-full flex-col justify-between p-8">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-xs font-bold text-green-400">
                            {lesson.number}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-green-400/50">
                            Lesson
                          </span>
                        </div>
                        <h3 className="mt-6 text-xl font-bold text-white">
                          {lesson.title}
                        </h3>
                        <p className="mt-4 text-sm leading-relaxed text-slate-400">
                          {lesson.description}
                        </p>
                      </div>
                      <div className="mt-6 rounded-lg border border-green-500/10 bg-green-500/[0.04] px-4 py-3">
                        <p className="text-xs text-green-400/80">
                          <span className="font-semibold">Pro tip:</span>{' '}
                          {lesson.tip}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </CardSwap>
            </div>
          </FadeContent>
        </div>
      </div>
    </div>
  )
}
