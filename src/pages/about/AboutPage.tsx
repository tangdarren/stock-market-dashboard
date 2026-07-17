import { usePageTitle } from '@/hooks/usePageTitle'
import { FadeContent } from '@/features/ui/components/FadeContent'
import Folder from '@/features/ui/components/Folder'

const stats = [
  { label: 'Focus', value: 'Market Intelligence' },
  { label: 'Founded', value: '2026' },
  { label: 'Status', value: 'Active' },
]

const capabilities = [
  'Real-Time Data',
  'Trend Analysis',
  'Overnight Summaries',
  'Gap Analysis',
  'Risk Framing',
  'Pre-Market Intel',
]

const timeline = [
  {
    index: '01',
    period: '2019 — Present',
    title: 'Discovering the Market',
    subtitle: 'The Beginning',
    description:
      'Started studying equities, price action, and market structure. What began as curiosity turned into a deep, lasting obsession with understanding how markets move and why most traders lose.',
  },
  {
    index: '02',
    period: '2021 — 2022',
    title: 'Teaching & Leading',
    subtitle: 'Community',
    description:
      'Built and ran a trading group focused on education and live analysis. Helped others develop real frameworks for reading the market — then stepped away to sharpen skills and pursue new projects.',
  },
  {
    index: '03',
    period: '2022 — 2025',
    title: 'Going Deeper',
    subtitle: 'Mastery',
    description:
      'Years of screen time, refining strategy, and learning to trade with discipline over impulse. Focused on consistency, risk management, and building the kind of edge that compounds quietly over time.',
  },
  {
    index: '04',
    period: '2026 — Ongoing',
    title: 'Building Tempest',
    subtitle: 'Product & Purpose',
    description:
      'Channeling years of market experience into a platform that gives traders what they actually need — clarity before the open, structured context, and tools built by someone who trades. Tempest is the tool I wish I had from day one.',
  },
]


export function AboutPage() {
  usePageTitle('About')

  return (
    <div className="min-h-screen">
      {/* ── Creator + Platform side by side ──────────────────────── */}
      <section className="relative overflow-hidden pb-24 pt-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-green-500/[0.04] blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-36 lg:flex-row">
            {/* Creator card — left, ~1/3 */}
            <FadeContent delay={0} className="lg:w-[38%] lg:-translate-x-4">
              <div className="relative h-full">
                <span className="absolute -left-4 -top-4 h-8 w-8 border-l border-t border-green-500/20" />
                <span className="absolute -right-4 -top-4 h-8 w-8 border-r border-t border-green-500/20" />
                <span className="absolute -bottom-4 -left-4 h-8 w-8 border-b border-l border-green-500/20" />
                <span className="absolute -bottom-4 -right-4 h-8 w-8 border-b border-r border-green-500/20" />
              <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-400/60">
                  N°001 — Creator
                </p>
                <h2 className="mt-3 text-2xl font-bold uppercase tracking-tight text-white">
                  DARREN TANG
                </h2>
                <p className="mt-1 text-sm font-medium text-green-400/80">
                  Founder & Developer
                </p>

                <div className="relative mt-6 overflow-hidden rounded-xl">
                  <span className="absolute -left-2 -top-2 z-10 h-5 w-5 border-l border-t border-green-500/25" />
                  <span className="absolute -bottom-2 -right-2 z-10 h-5 w-5 border-b border-r border-green-500/25" />
                  <img
                    src="/darren.png"
                    alt="Darren Tang"
                    className="aspect-[4/3] w-full rounded-xl object-cover object-top grayscale-[20%]"
                  />
                </div>

                <p className="mt-6 text-sm leading-relaxed text-slate-400">
                  22-year-old developer and active trader. Built Tempest to
                  replace noise with signal.
                </p>

                <div className="mt-8 space-y-4 border-t border-white/[0.04] pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Location</span>
                    <span className="text-sm text-white">United States</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Trading Since</span>
                    <span className="text-sm text-white">2019</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Focus</span>
                    <span className="text-sm text-white">Equities & Price Action</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Stack</span>
                    <span className="text-sm text-white">React · TypeScript · Node</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Philosophy</span>
                    <span className="text-sm text-white">Preparation Over Prediction</span>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/[0.04] pt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Mission</p>
                  <p className="mt-2 text-sm italic leading-relaxed text-slate-400">
                    "Give every trader the tools and context that used to be
                    reserved for institutional desks."
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  {['Developer', 'Trader', 'Designer', 'Builder'].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-slate-400"
                      >
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              </div>
              </div>
            </FadeContent>

            {/* Platform card — right, ~2/3 (unchanged content) */}
            <FadeContent delay={100} className="lg:w-[62%] lg:translate-x-4">
              <div className="relative h-full">
                <span className="absolute -left-4 -top-4 h-8 w-8 border-l border-t border-green-500/20" />
                <span className="absolute -right-4 -top-4 h-8 w-8 border-r border-t border-green-500/20" />
                <span className="absolute -bottom-4 -left-4 h-8 w-8 border-b border-l border-green-500/20" />
                <span className="absolute -bottom-4 -right-4 h-8 w-8 border-b border-r border-green-500/20" />

                <div className="flex h-full flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-400/60">
                        N°002 — Platform
                      </p>
                      <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
                        TEMPEST
                      </h1>
                      <p className="mt-2 text-sm font-medium text-green-400/80">
                        Market Intelligence Platform
                      </p>
                    </div>
                    <img
                      src="/tempest-logo.png"
                      alt="Tempest"
                      className="h-14 w-14 shrink-0 object-contain sm:mr-12 sm:mt-4"
                    />
                  </div>

                  <div className="mt-8 flex flex-wrap gap-8 border-t border-white/[0.04] pt-8">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">
                          {stat.label}
                        </span>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-8 max-w-2xl text-sm leading-relaxed text-slate-400">
                    Tempest is a market intelligence platform built for traders who
                    believe preparation is the ultimate edge. We deliver real-time
                    data, overnight analysis, trend signals, and structured
                    pre-market context — so you walk into every session with
                    clarity, not chaos.
                  </p>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
                    Every feature is designed around one principle: the best trade
                    starts before the market opens. Tempest gives you the
                    structure to prepare, the data to confirm, and the speed to
                    execute — without the noise.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/[0.04] pt-8">
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <span className="text-2xl font-bold text-green-400">30s</span>
                      <p className="mt-1 text-xs text-slate-500">Data refresh interval</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <span className="text-2xl font-bold text-green-400">24/7</span>
                      <p className="mt-1 text-xs text-slate-500">Overnight monitoring</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <span className="text-2xl font-bold text-green-400">5+</span>
                      <p className="mt-1 text-xs text-slate-500">Trading lessons</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <span className="text-2xl font-bold text-green-400">0</span>
                      <p className="mt-1 text-xs text-slate-500">Ads or distractions</p>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-2">
                    {capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-slate-400"
                      >
                        ★ {cap}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-white/[0.04] pt-6 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-700">
                    <span>Built by Darren Tang</span>
                    <span>2024 — Present</span>
                  </div>
                </div>
              </div>
            </FadeContent>
          </div>
        </div>
      </section>

      {/* ── Timeline / Story ────────────────────────────────────────── */}
      <section className="relative border-t border-white/[0.04] py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <FadeContent>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Journey
            </h2>
          </FadeContent>

          <div className="relative mt-16">
            <div className="absolute bottom-0 left-[23px] top-0 w-px bg-gradient-to-b from-green-500/20 via-green-500/10 to-transparent sm:left-[31px]" />

            <div className="space-y-12">
              {timeline.map((item, i) => (
                <FadeContent key={item.index} delay={i * 100}>
                  <div className="flex gap-6 sm:gap-10">
                    <div className="relative flex shrink-0 flex-col items-center">
                      <span className="text-[10px] font-bold text-green-400/40">
                        {item.index}
                      </span>
                      <div className="mt-2 h-3 w-3 rounded-full border border-green-500/40 bg-green-500/20" />
                    </div>

                    <div className="group flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-green-500/15 hover:bg-white/[0.03]">
                      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
                        {item.period}
                      </span>
                      <h3 className="mt-2 text-base font-semibold text-white">
                        {item.title}
                      </h3>
                      <span className="mt-1 block text-xs font-medium text-green-400/60">
                        {item.subtitle}
                      </span>
                      <p className="mt-3 text-sm leading-relaxed text-slate-500">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </FadeContent>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Philosophy ──────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.04] py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <FadeContent>
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-16 lg:flex-row lg:items-center lg:justify-between">
              <div className="shrink-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-400/80">
                  Philosophy
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  What Drives Us
                </h2>
              </div>
              <div className="flex shrink-0 items-center justify-center" style={{ width: '300px', height: '250px' }}>
                <Folder
                  color="#00FFB2"
                  size={2}
                  items={[
                    <span key="1"></span>,
                    <span key="2"></span>,
                    <span key="3">Conviction</span>,
                  ]}
                />
              </div>
            </div>
          </FadeContent>
        </div>
      </section>

    </div>
  )
}
