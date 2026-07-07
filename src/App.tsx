import { StoreProvider } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ProfileBar } from './components/ProfileBar'
import { PlanBasics, MarketModel, WithdrawalPanel } from './components/Controls'
import { AccountsPanel, ContribPanel, EventsPanel, ExpensePanel, IncomePanel } from './components/Collections'
import { Results } from './components/Results'
import { Section } from './components/ui'

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Toolbar />
        <ProfileBar />
        <div className="layout">
          <aside className="controls">
            <Section title="Plan basics" subtitle="timeline & macro">
              <PlanBasics />
            </Section>
            <Section title="Accounts" subtitle="where wealth grows">
              <AccountsPanel />
            </Section>
            <Section title="Income" subtitle="salary, pension, benefits">
              <IncomePanel />
            </Section>
            <Section title="Expenses" subtitle="what you spend">
              <ExpensePanel />
            </Section>
            <Section title="Contributions" subtitle="saving while you work" defaultOpen={false}>
              <ContribPanel />
            </Section>
            <Section title="One-off events" subtitle="big lumps in & out" defaultOpen={false}>
              <EventsPanel />
            </Section>
            <Section title="Retirement spending" defaultOpen={false}>
              <WithdrawalPanel />
            </Section>
            <Section title="Market model" subtitle="risk & randomness" defaultOpen={false}>
              <MarketModel />
            </Section>
          </aside>
          <main className="output">
            <Results />
          </main>
        </div>
        <footer className="app-foot">
          Fortuna runs entirely on your device — nothing you enter ever leaves it. It is an educational
          model, not financial advice. Simulated results assume the return distribution you set and cannot
          predict real markets.
        </footer>
      </div>
    </StoreProvider>
  )
}
