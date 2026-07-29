import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Database,
  GitBranch,
  Lock,
  Radio,
  ShieldCheck,
  Zap,
  CornerDownRight,
  Users,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ObjectGraph from '@/components/ontology/ObjectGraph'
import {
  CARDINALITY_LABEL,
  FALLBACK_ONTOLOGY,
  fetchOntology,
  typeColor,
  type OntologyAction,
  type OntologySnapshot,
} from '@/lib/ontology'

// ─── Small shared pieces ─────────────────────────────────────────────────────

function TypeChip({ typeKey, label }: { typeKey: string; label: string }) {
  return (
    <span
      className={`${typeColor(
        typeKey,
      )} inline-flex items-center rounded-md border border-current/30 bg-current/[0.08] px-2 py-0.5 font-mono text-[11px] font-semibold`}
    >
      {label}
    </span>
  )
}

function StatPill({ icon: Icon, children }: { icon: typeof Database; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Ontology() {
  const [snapshot, setSnapshot] = useState<OntologySnapshot>(FALLBACK_ONTOLOGY)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOntology().then((s) => {
      if (!cancelled) setSnapshot(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { types, links, actions, permissions, live } = snapshot
  const selected = pinned ?? hovered

  const labelFor = useMemo(
    () => Object.fromEntries(types.map((t) => [t.key, t.label])),
    [types],
  )

  const selectedType = types.find((t) => t.key === selected) ?? null
  const outgoing = links.filter((l) => l.from_type === selected)
  const incoming = links.filter((l) => l.to_type === selected)
  const selectedActions = actions.filter((a) => a.target_type === selected)
  const cascadingActions = actions.filter((a) => a.cascades.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hero-gradient pt-32 pb-20 text-primary-foreground">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-foreground/80">
            The world model
          </span>
          <h1 className="mb-5 text-4xl font-bold text-primary-foreground sm:text-5xl lg:text-6xl">
            One ontology, not a task list
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-primary-foreground/80">
            Every survey finding, change order and owner decision is a typed object
            with typed links. State does not sit in a spreadsheet waiting to be
            reconciled — it propagates.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <StatPill icon={Database}>
              {types.length} object types · {links.length} links
            </StatPill>
            <StatPill icon={Zap}>{actions.length} Actions</StatPill>
            <StatPill icon={live ? Radio : GitBranch}>
              {live ? 'Read live from the registry' : 'Bundled copy'}
            </StatPill>
          </div>
        </div>
      </section>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <Tabs defaultValue="graph">
          <TabsList className="mb-10 grid w-full grid-cols-3 gap-0 sm:inline-grid sm:w-auto">
            <TabsTrigger value="graph">Object Graph</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="cascade">Cascade</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: the graph ───────────────────────────────────────── */}
          <TabsContent value="graph">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold">The object graph</h2>
              <p className="max-w-2xl text-muted-foreground">
                Hover any object to isolate what it touches; click to pin it. The
                labels on the edges are the link names the database actually
                stores, and the mono text under each object is its table.
              </p>
            </div>

            <Card className="mb-6 overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                <ObjectGraph
                  types={types}
                  links={links}
                  selected={selected}
                  pinned={pinned}
                  onHover={setHovered}
                  onPin={setPinned}
                />
              </CardContent>
            </Card>

            {/* Detail panel — the reason the graph is interactive at all. */}
            <Card
              className={`transition-colors ${
                selectedType ? 'border-accent/40' : 'border-dashed'
              }`}
            >
              <CardContent className="p-5 sm:p-6">
                {!selectedType ? (
                  <p className="text-sm text-muted-foreground">
                    Select an object to see its links and the Actions that can
                    change it. The three across the top right —{' '}
                    <span className="font-medium text-foreground">Defect</span>,{' '}
                    <span className="font-medium text-foreground">Change Order</span>,{' '}
                    <span className="font-medium text-foreground">Owner Approval</span>{' '}
                    — are the cascade, and the reason this is not a task tracker.
                  </p>
                ) : (
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="md:col-span-1">
                      <TypeChip typeKey={selectedType.key} label={selectedType.label} />
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {selectedType.description}
                      </p>
                      <p className="mt-3 font-mono text-xs text-muted-foreground">
                        {selectedType.table_name}
                      </p>
                    </div>

                    <div className="md:col-span-2 grid gap-5 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Links out
                        </p>
                        {outgoing.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {outgoing.map((l) => (
                              <li
                                key={`${l.to_type}-${l.via_column}`}
                                className="flex flex-wrap items-center gap-1.5 text-sm"
                              >
                                <span className="text-muted-foreground">{l.label}</span>
                                <ArrowRight className="h-3 w-3 flex-shrink-0 text-accent" />
                                <TypeChip
                                  typeKey={l.to_type}
                                  label={labelFor[l.to_type] ?? l.to_type}
                                />
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {CARDINALITY_LABEL[l.cardinality]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Links in
                        </p>
                        {incoming.length === 0 ? (
                          <p className="text-sm text-muted-foreground">None.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {incoming.map((l) => (
                              <li
                                key={`${l.from_type}-${l.via_column}`}
                                className="flex flex-wrap items-center gap-1.5 text-sm"
                              >
                                <TypeChip
                                  typeKey={l.from_type}
                                  label={labelFor[l.from_type] ?? l.from_type}
                                />
                                <span className="text-muted-foreground">{l.label}</span>
                                <ArrowRight className="h-3 w-3 flex-shrink-0 text-accent" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {selectedActions.length > 0 && (
                        <div className="sm:col-span-2 border-t border-border pt-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Actions that change it
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedActions.map((a) => (
                              <span
                                key={a.key}
                                className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                              >
                                {a.key}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Full type list */}
            <div className="mt-10">
              <h3 className="mb-4 text-base font-semibold">
                All {types.length} object types
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {types.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setPinned(pinned === t.key ? null : t.key)}
                    className={`rounded-[var(--radius)] border p-4 text-left transition-colors hover:border-accent/40 ${
                      pinned === t.key ? 'border-accent/60 bg-accent/5' : 'border-border'
                    }`}
                  >
                    <TypeChip typeKey={t.key} label={t.label} />
                    <p className="mt-2 text-sm leading-snug text-muted-foreground">
                      {t.description}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
                      {t.table_name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Tab 2: Actions ─────────────────────────────────────────── */}
          <TabsContent value="actions">
            <div className="mb-6 max-w-2xl">
              <h2 className="mb-2 text-2xl font-bold">The write path</h2>
              <p className="text-muted-foreground">
                These {actions.length} Actions are the only way anything in the
                model changes. Not the preferred way — the only way. Applications,
                users and the agent all go through them, and each one validates,
                mutates and records an audit event in a single transaction.
              </p>
            </div>

            <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
              The roles under each Action are who may invoke it. That list is a
              table in the database, checked inside the Action itself — not a
              rule the interface is trusted to apply. Anyone on the project can
              raise a finding; changing scope, money or a decision is narrower.
            </p>

            <div className="mb-8 flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 gap-3 rounded-[var(--radius)] border border-border p-4">
                <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <p className="text-sm text-muted-foreground">
                  The signed-in role holds{' '}
                  <span className="font-medium text-foreground">
                    zero INSERT, UPDATE or DELETE grants
                  </span>{' '}
                  on the object tables. A client that tries to write directly is
                  refused by Postgres, not by a convention someone remembered to
                  follow.
                </p>
              </div>
              <div className="flex flex-1 gap-3 rounded-[var(--radius)] border border-border p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <p className="text-sm text-muted-foreground">
                  Provenance is stamped server-side from the session, never sent by
                  the caller. Who changed what, and what it changed in turn, is not
                  forgeable from the browser.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {actions.map((action) => (
                <ActionCard
                  key={action.key}
                  action={action}
                  labelFor={labelFor}
                  roles={permissions[action.key] ?? []}
                />
              ))}
            </div>
          </TabsContent>

          {/* ── Tab 3: Cascade ─────────────────────────────────────────── */}
          <TabsContent value="cascade">
            <div className="mx-auto max-w-3xl">
              <div className="mb-8">
                <h2 className="mb-3 text-2xl font-bold">Why a graph earns its keep</h2>
                <p className="leading-relaxed text-muted-foreground">
                  A task tracker records that a defect was found. A world model
                  knows what that defect <em>means</em>: that the scope has grown,
                  that the growth has a price, and that somebody has to say yes to
                  it. Below is the rule as the database actually enforces it — not
                  an illustration of one.
                </p>
              </div>

              {/* The rule */}
              <Card className="mb-6 border-accent/30">
                <CardContent className="p-5 sm:p-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    The cascade rule, in full
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-muted/60 px-4 py-3 font-mono text-xs leading-relaxed text-foreground/85">
{`severity in ('HIGH', 'CRITICAL')
  and coalesce(cost_impact, 0) > 0`}
                  </pre>
                  <p className="mt-3 text-sm text-muted-foreground">
                    When an NCR raised through{' '}
                    <code className="font-mono text-xs">action_raise_defect</code>{' '}
                    satisfies both halves, the Change Order and the Owner Approval
                    are created in the same transaction as the defect. Not by a
                    background job, not by a webhook that might be down — if the
                    defect exists, so do its consequences.
                  </p>
                </CardContent>
              </Card>

              {/* Three steps */}
              <div className="space-y-2">
                {[
                  {
                    key: 'DEFECT_RECORD',
                    title: 'The finding is recorded',
                    body:
                      'Severity, root cause, disposition, cost and schedule impact — stamped with the surveyor who raised it and the date it was found.',
                  },
                  {
                    key: 'CHANGE_ORDER',
                    title: 'The scope change is raised',
                    body:
                      'Carrying the defect\'s cost and schedule impact forward, linked back to the NCR that caused it. Nobody retypes the number, so nobody mistypes it.',
                  },
                  {
                    key: 'OWNER_APPROVAL',
                    title: 'The decision is queued',
                    body:
                      'Tiered by cost: under €10k is Tier 1, €10k–€50k is Tier 2, above that Tier 3. The owner sees a decision, not a spreadsheet row.',
                  },
                ].map((step, i, all) => (
                  <div key={step.key}>
                    <Card>
                      <CardContent className="flex gap-4 p-5">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <TypeChip
                              typeKey={step.key}
                              label={labelFor[step.key] ?? step.key}
                            />
                            <span className="text-sm font-semibold">{step.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{step.body}</p>
                        </div>
                      </CardContent>
                    </Card>
                    {i < all.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Which actions cascade */}
              {cascadingActions.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-3 text-base font-semibold">
                    Everything that cascades
                  </h3>
                  <div className="space-y-2">
                    {cascadingActions.map((a) => (
                      <div
                        key={a.key}
                        className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border px-4 py-3 text-sm"
                      >
                        <code className="font-mono text-xs text-foreground">{a.key}</code>
                        <CornerDownRight className="h-3.5 w-3.5 text-accent" />
                        {a.cascades.map((c) => (
                          <TypeChip key={c} typeKey={c} label={labelFor[c] ?? c} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-6">
                <h4 className="mb-2 text-base font-bold text-primary">
                  The part that is hard to copy
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Any system can store a defect. The difference is where the rule
                  lives. Here it is a property of the database: there is no code
                  path — no integration, no import, no well-meaning colleague with
                  SQL access — that can create a material defect without also
                  creating the approval it requires. That is why the audit trail
                  can be trusted, and why an agent can be handed the same Actions a
                  human uses without being handed more power than one.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <Footer />
    </div>
  )
}

// ─── Action card ─────────────────────────────────────────────────────────────

function ActionCard({
  action,
  labelFor,
  roles,
}: {
  action: OntologyAction
  labelFor: Record<string, string>
  /** Roles permitted to invoke it. Enforced by the Action, not by the UI. */
  roles: string[]
}) {
  const [open, setOpen] = useState(false)
  const required = action.parameters.filter((p) => p.required)
  const optional = action.parameters.filter((p) => !p.required)

  return (
    <Card className={action.cascades.length > 0 ? 'border-accent/30' : undefined}>
      <CardContent className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TypeChip
            typeKey={action.target_type}
            label={labelFor[action.target_type] ?? action.target_type}
          />
          <span className="text-sm font-semibold">{action.label}</span>
          <code className="font-mono text-[11px] text-muted-foreground">
            {action.key}
          </code>
        </div>

        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {action.description}
        </p>

        {action.cascades.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-accent" />
            {/* "cascades to", not "creates" — raising a defect creates the
                Change Order, but deciding an approval updates one that exists. */}
            <span className="text-xs font-medium text-muted-foreground">
              cascades to
            </span>
            {action.cascades.map((c) => (
              <TypeChip key={c} typeKey={c} label={labelFor[c] ?? c} />
            ))}
          </div>
        )}

        {roles.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {roles.map((r) => (
              <span
                key={r}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {r.replace(/_/g, ' ').toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {action.parameters.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No parameters — the outcome is derived server-side.
          </p>
        ) : (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {open
                ? 'Hide parameters'
                : `${required.length} required · ${optional.length} optional`}
            </button>

            {open && (
              <div className="mt-3 space-y-1 rounded-md bg-muted/50 px-3 py-2.5 font-mono text-xs">
                {action.parameters.map((p) => (
                  <div key={p.name} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-foreground/85">{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.type}
                      {p.required ? '' : '?'}
                    </span>
                    {p.values && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {p.values.join(' | ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
