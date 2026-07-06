# ◈ Fortuna — Financial Future Simulator

An uber-customizable, browser-only simulator for projecting where your money is headed.
Model your income, expenses, accounts, taxes, big life events and market risk, then run a
**Monte-Carlo** experiment over thousands of possible lifetimes and see the range of outcomes —
not a single fake "you'll have $X" number.

Everything runs client-side. Nothing you enter ever leaves the page.

## What it does

- **Multiple accounts** — taxable, pre-tax (401k/IRA), Roth and cash, each with its own
  expected return and volatility, and a shared market factor so diversification behaves realistically.
- **Income streams** — salary with real raises, Social Security, pensions, rental income; each with
  its own start/end age and taxable flag.
- **Expenses & one-off events** — recurring living costs plus dated lumps (buy a house, tuition,
  an inheritance).
- **Contributions** — automatic saving into any account while you work, with employer match.
- **Retirement withdrawal strategies** — cover-the-gap, fixed real spend, or percent-of-portfolio.
- **Market models** — Gaussian, fat-tailed Student-t, lognormal, or fixed (deterministic).
- **Rich output** — a percentile fan chart (5/25/50/75/95), probability your money lasts, downside
  and upside net worth, the typical age money runs out, and a full year-by-year cash-flow ledger.
- **Compare scenarios** — snapshot any plan and overlay its median on the chart.
- **Presets** — fresh grad, mid-career, FIRE aspirant, near-retirement — one click to explore.
- **Save / export / import** — the current plan persists in your browser; export or import as JSON.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

Static output — the built `dist/` folder can be dropped on any static host (GitHub Pages, Netlify, …).

## How the model works

Each simulated life steps once per year from your current age to your plan-end age. In every year the
engine runs a cash-flow **waterfall**: income minus taxes, expenses, contributions and one-off events.
A surplus is saved; a shortfall is withdrawn from your accounts (cash → taxable → pre-tax → Roth), with
pre-tax withdrawals grossed up for tax. Then each account grows by a return drawn from its own
distribution, correlated across accounts through a shared market factor. Balances that are deflated to
today's dollars form the percentile bands; a run is "solvent" if it never fully depletes.

The Monte-Carlo runs in a **Web Worker** so the UI stays smooth even at 20,000 paths, and every run is
reproducible from the scenario's random seed.

```
src/
  engine/     types, seeded RNG, the simulation, and the worker
  state/      scenario model, presets, reducer, store, sim hook
  components/ toolbar, control panels, fan chart, results & ledger
```

## Caveats

Fortuna is an educational model, **not financial advice**. Real markets are not i.i.d. draws from the
distribution you pick; taxes, fees and behaviour are simplified. Treat the bands as "what this set of
assumptions implies," not a forecast.

## License

MIT
