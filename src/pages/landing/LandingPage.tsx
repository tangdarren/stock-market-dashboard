import { usePageTitle } from '@/hooks/usePageTitle'
import { FadeContent } from '@/features/ui/components/FadeContent'
import Grainient from '@/features/ui/components/Grainient'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/lib/constants/routes'
import { motion } from 'framer-motion'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.15 + i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
}

const benefits = [
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Real-Time Intelligence',
    description: 'Live market data refreshed every 30 seconds. Never trade on stale information again.',
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    title: 'Advanced Analytics',
    description: 'Trend analysis, gap detection, and overnight summaries to frame every session with clarity.',
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Pre-Market Context',
    description: 'Know what happened overnight before the bell rings. Walk in prepared, not reactive.',
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'Institutional-Grade Security',
    description: 'Your data and sessions are protected with modern security standards. No compromises.',
  },
]

const showcaseCards = [
  { ticker: 'NQ', name: 'E-mini Nasdaq', price: '$18,945.25', change: '+2.67%', up: true },
  { ticker: 'ES', name: 'E-mini S&P 500', price: '$5,428.50', change: '+1.82%', up: true },
  { ticker: 'GC', name: 'Gold Futures', price: '$2,341.80', change: '+0.93%', up: true },
  { ticker: 'MSFT', name: 'Microsoft', price: '$415.50', change: '+1.09%', up: true },
  { ticker: 'AMZN', name: 'Amazon', price: '$185.92', change: '+3.14%', up: true },
  { ticker: 'META', name: 'Meta Platforms', price: '$502.30', change: '+2.65%', up: true },
]

const steps = [
  { num: '01', title: 'Open the Dashboard', description: 'Launch Tempest and get an instant snapshot of the market — pre-market movers, overnight gaps, and trend direction.' },
  { num: '02', title: 'Analyze with Context', description: 'Use built-in analytics, support/resistance levels, and volume signals to frame your thesis before the bell.' },
  { num: '03', title: 'Execute with Conviction', description: 'Trade with clarity, not emotion. Every decision backed by structured data and real-time intelligence.' },
]

const philosophy = [
  { label: 'Clarity over noise', description: 'Strip away the chaos. See only what matters.' },
  { label: 'Preparation is edge', description: 'The best trade starts before the market opens.' },
  { label: 'Speed with discipline', description: 'Fast enough to capture. Disciplined enough to wait.' },
  { label: 'Built by traders', description: 'Every feature shaped by real trading experience.' },
]

export function LandingPage() {
  usePageTitle()

  return (
    <div>
      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-48 pt-48 sm:pt-56 lg:pb-[400px] lg:pt-64">
        <div className="pointer-events-none absolute inset-0">
          <Grainient
            color1="#00FFB2"
            color2="#003322"
            color3="#000000"
            timeSpeed={0.5}
            colorBalance={0.1}
            warpStrength={1.2}
            warpFrequency={4}
            warpSpeed={1.5}
            warpAmplitude={45}
            blendAngle={15}
            blendSoftness={0.1}
            rotationAmount={450}
            noiseScale={2.5}
            grainAmount={0.08}
            grainScale={2}
            grainAnimated={false}
            contrast={1.6}
            gamma={1}
            saturation={1.1}
            centerX={0}
            centerY={0}
            zoom={0.85}
            className="opacity-50"
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-center lg:gap-20">
            <div className="flex-1 text-center lg:-translate-x-8 lg:translate-y-[50px] lg:text-left">
              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#202026]/20 bg-[#00FFB2]/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#00FFB2]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00FFB2]" />
                  Market Intelligence Platform
                </span>
              </motion.div>

              <motion.h1
                className="mt-8 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl"
                variants={fadeUp} initial="hidden" animate="visible" custom={1}
              >
                Trade Smarter.
                <br />
                <span className="bg-gradient-to-r from-[#00FFB2] to-[#00e6a0] bg-clip-text text-transparent">
                  Move Faster.
                </span>
              </motion.h1>

              <motion.p
                className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-slate-400 lg:mx-0"
                variants={fadeUp} initial="hidden" animate="visible" custom={2}
              >
                Live market data, overnight context, and clear analytics
                so you can walk into every trading session with confidence
                and make better decisions faster.
              </motion.p>

              <motion.div
                className="mt-6 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
                variants={fadeUp} initial="hidden" animate="visible" custom={3}
              >
                <Link
                  to={ROUTES.DAILY}
                  className="group inline-flex items-center gap-4 rounded-full border border-white/10 bg-white/[0.05] py-3 pl-9 pr-3 text-lg font-semibold text-white transition-all duration-300 hover:border-[#00FFB2]/30 hover:bg-white/[0.08] hover:shadow-[0_0_30px_rgba(0,255,178,0.15)]"
                >
                  Start now
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00FFB2] transition-transform duration-300 group-hover:scale-105">
                    <svg className="h-5 w-5 -rotate-45 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                    </svg>
                  </span>
                </Link>
              </motion.div>
            </div>

            {/* Hero product mockup */}
            <motion.div
              className="w-full max-w-lg flex-shrink-0 lg:max-w-xl lg:translate-x-8 lg:translate-y-[50px]"
              variants={fadeUp} initial="hidden" animate="visible" custom={2}
            >
              <div className="relative rounded-2xl border border-[#00FFB2]/12 bg-white/[0.03] p-8 shadow-[0_0_30px_rgba(0,255,178,0.08),0_0_60px_rgba(0,255,178,0.04)] backdrop-blur-sm">
                <div className="flex items-center justify-between pb-5">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#00FFB2]/70">Portfolio</p>
                    <p className="mt-1 text-3xl font-bold text-white">$58,417.32</p>
                  </div>
                  <span className="rounded-lg bg-[#00FFB2]/10 px-4 py-2 text-base font-semibold text-[#00FFB2]">+16.8%</span>
                </div>

                <div className="h-px bg-white/[0.06]" />

                <div className="mt-5 space-y-3.5">
                  {showcaseCards.slice(0, 3).map((s) => (
                    <div key={s.ticker} className="flex items-center justify-between rounded-xl border border-[#202026] bg-white/[0.02] px-5 py-4 transition-colors hover:bg-white/[0.04]">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.06] text-sm font-bold text-white">
                          {s.ticker.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-white">{s.ticker}</p>
                          <p className="text-sm text-slate-500">{s.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold text-white">{s.price}</p>
                        <p className={`text-sm font-medium ${s.up ? 'text-[#00FFB2]' : 'text-red-400'}`}>{s.change}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-[#00FFB2]/10 blur-2xl" />
                <div className="absolute -bottom-2 -left-2 h-16 w-16 rounded-full bg-purple-500/[0.06] blur-2xl" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ───────────────────────────────────────────── */}
      <section className="border-y border-[#202026]/60 py-10">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <FadeContent>
            <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5 text-[#00FFB2]">
                  {Array.from({ length: 5 }).map((_, i) => <span key={i} className="text-base">★</span>)}
                </div>
                <span className="text-sm font-medium text-white">4.9</span>
              </div>
              <p className="max-w-xl text-center text-sm leading-relaxed text-slate-400">
                Precision, performance, and clarity — empowering you to navigate the market with confidence and speed.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Real-Time</span>
                <span className="h-1 w-1 rounded-full bg-[#00FFB2]" />
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Secure</span>
                <span className="h-1 w-1 rounded-full bg-[#00FFB2]" />
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">Free</span>
              </div>
            </div>
          </FadeContent>
        </div>
      </section>

      {/* ── WHY TEMPEST ───────────────────────────────────────────── */}
      <section className="py-24 lg:py-32" id="features">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <FadeContent>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">Why Tempest?</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Built for traders who demand more.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
                Every feature designed to give you an edge — from pre-market
                preparation to intraday execution.
              </p>
            </div>
          </FadeContent>

          <div className="mt-16 grid gap-5 sm:grid-cols-2">
            {benefits.map((b, i) => (
              <FadeContent key={b.title} delay={i * 80}>
                <div className="group rounded-2xl border border-[#202026] bg-white/[0.02] p-8 transition-all duration-300 hover:border-[#202026]/15 hover:bg-white/[0.04] hover:shadow-[0_0_40px_rgba(0,255,178,0.04)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#202026]/20 bg-[#00FFB2]/[0.08] text-[#00FFB2] transition-colors group-hover:bg-[#00FFB2]/[0.12]">
                    {b.icon}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.description}</p>
                </div>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── MARKET SHOWCASE ───────────────────────────────────────── */}
      <section className="border-t border-[#202026]/60 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-20">
            <div className="flex-1">
              <FadeContent>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">All Stocks, One Platform</p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Track, analyze, and act — all in one place.
                </h2>
                <p className="mt-4 max-w-md text-base text-slate-400">
                  Monitor the entire market from a single dashboard. Real-time
                  prices, trend signals, and overnight context for every ticker
                  that matters to you.
                </p>
                <Link
                  to={ROUTES.DAILY}
                  className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-[#00FFB2] px-7 text-sm font-semibold !text-black transition-all duration-300 hover:bg-[#00FFB2] hover:shadow-[0_0_30px_rgba(0,255,178,0.35)]"
                >
                  Open Dashboard →
                </Link>
              </FadeContent>
            </div>

            <FadeContent delay={100} className="flex-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {showcaseCards.map((s) => (
                  <div
                    key={s.ticker}
                    className="group rounded-xl border border-[#202026] bg-white/[0.02] p-4 transition-all duration-300 hover:border-[#202026]/15 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-bold text-white">
                        {s.ticker.slice(0, 2)}
                      </div>
                      <p className="text-sm font-semibold text-white">{s.ticker}</p>
                    </div>
                    <p className="mt-3 text-lg font-bold text-white">{s.price}</p>
                    <p className={`mt-1 text-xs font-semibold ${s.up ? 'text-[#00FFB2]' : 'text-red-400'}`}>
                      {s.change}
                    </p>
                  </div>
                ))}
              </div>
            </FadeContent>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
      <section className="border-t border-[#202026]/60 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <FadeContent>
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">How It Works</p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Three steps to sharper trading.
                </h2>
              </div>
              <Link
                to={ROUTES.DAILY}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-6 text-sm font-semibold text-white transition-all hover:border-white/20 hover:bg-white/[0.04]"
              >
                Get Started →
              </Link>
            </div>
          </FadeContent>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <FadeContent key={s.num} delay={i * 100}>
                <div className="group relative rounded-2xl border border-[#202026] bg-white/[0.02] p-8 transition-all duration-300 hover:border-[#202026]/15 hover:bg-white/[0.04]">
                  <span className="text-4xl font-extrabold text-[#00FFB2]/15 transition-colors group-hover:text-[#00FFB2]/25">
                    {s.num}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.description}</p>
                </div>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY / CREDIBILITY ──────────────────────────────── */}
      <section className="border-t border-[#202026]/60 py-24 lg:py-32">
        <div className="mx-auto max-w-6xl px-6 lg:px-8">
          <FadeContent>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">Our Philosophy</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Built different. For a reason.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base text-slate-400">
                Tempest isn't another flashy trading app. It's a focused tool
                built by a trader who got tired of noise.
              </p>
            </div>
          </FadeContent>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-4">
            {philosophy.map((p, i) => (
              <FadeContent key={p.label} delay={i * 60}>
                <div className="bg-[#0d0c14] p-8 text-center transition-colors hover:bg-white/[0.02]">
                  <h3 className="text-base font-bold text-white">{p.label}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">{p.description}</p>
                </div>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section className="border-t border-[#202026]/60 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <FadeContent>
            <div className="relative overflow-hidden rounded-3xl border border-[#202026] bg-white/[0.02] p-12 text-center sm:p-16">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#00FFB2]/[0.08] blur-[100px]" />
                <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-purple-500/[0.04] blur-[80px]" />
              </div>
              <div className="relative z-10">
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Ready to trade with clarity?
                </h2>
                <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-400">
                  Join traders who start every session with structured data,
                  real-time context, and the confidence to act decisively.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link
                    to={ROUTES.DAILY}
                    className="inline-flex h-13 items-center gap-2 rounded-xl bg-[#00FFB2] px-8 text-sm font-semibold !text-black transition-all duration-300 hover:bg-[#00FFB2] hover:shadow-[0_0_40px_rgba(0,255,178,0.35)]"
                  >
                    Open Dashboard →
                  </Link>
                  <Link
                    to={ROUTES.ABOUT}
                    className="inline-flex h-13 items-center gap-2 rounded-xl border border-white/10 px-8 text-sm font-semibold text-white transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
                  >
                    Learn About Us
                  </Link>
                </div>
              </div>
            </div>
          </FadeContent>
        </div>
      </section>
    </div>
  )
}
