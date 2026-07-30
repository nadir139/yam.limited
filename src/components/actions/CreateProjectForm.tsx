import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateProject } from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'
import type { Project } from '@/lib/types'

// Starting a project.
//
// Only the name is required. Everything else is a fact you often do not have on
// day one — the yard is not chosen, the survey is not booked, the budget is not
// agreed — and demanding it up front is how a system trains people to type
// placeholder data into it. The Action defaults the phase to PRE_SURVEY and
// enrols the creator as owner's representative.

const TYPES: Project['project_type'][] = [
  'FIVE_YEAR_SURVEY',
  'REFIT',
  'NEWBUILD',
  'ANNUAL_SURVEY',
  'DAMAGE_REPAIR',
  'PROPERTY',
]

const CLASS_SOCIETIES = ['RINA', 'LR', 'DNV', 'ABS', 'BV']

const selectClass = 'h-10 w-full rounded-md border px-3 text-sm shadow-sm'
const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

export default function CreateProjectForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateProject()

  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState<Project['project_type']>('REFIT')
  const [yardName, setYardName] = useState('')
  const [yardLocation, setYardLocation] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedDelivery, setPlannedDelivery] = useState('')
  const [budget, setBudget] = useState('')
  const [classSociety, setClassSociety] = useState('')
  const [error, setError] = useState<string | null>(null)

  // A building has no class society, and offering one invites a wrong answer.
  const isProperty = projectType === 'PROPERTY'

  const submit = () => {
    setError(null)
    create.mutate(
      {
        name: name.trim(),
        projectType,
        yardName: yardName.trim() || null,
        yardLocation: yardLocation.trim() || null,
        plannedStart: plannedStart || null,
        plannedDelivery: plannedDelivery || null,
        budgetLocked: budget.trim() === '' ? null : Number(budget),
        classSociety: isProperty ? null : classSociety || null,
      },
      { onSuccess: onDone, onError: (e) => setError(e.message) },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="np-name">
          {t('project.name')} ({t('common.required')})
        </Label>
        <Input
          id="np-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder={t('project.namePlaceholder')}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-type">{t('project.type')}</Label>
          <select
            id="np-type"
            className={selectClass}
            style={selectStyle}
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as Project['project_type'])}
          >
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`projectType.${ty}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-budget">
            {t('project.budget')} (€, {t('common.optional')})
          </Label>
          <Input
            id="np-budget"
            type="number"
            min={0}
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-yard">{t('project.yardName')}</Label>
          <Input id="np-yard" value={yardName} onChange={(e) => setYardName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-location">{t('project.yardLocation')}</Label>
          <Input
            id="np-location"
            value={yardLocation}
            onChange={(e) => setYardLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-start">{t('project.plannedStart')}</Label>
          <Input
            id="np-start"
            type="date"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-delivery">{t('project.plannedDelivery')}</Label>
          <Input
            id="np-delivery"
            type="date"
            value={plannedDelivery}
            onChange={(e) => setPlannedDelivery(e.target.value)}
          />
        </div>
      </div>

      {!isProperty && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-class">{t('project.classSociety')}</Label>
          <select
            id="np-class"
            className={selectClass}
            style={selectStyle}
            value={classSociety}
            onChange={(e) => setClassSociety(e.target.value)}
          >
            <option value="">{t('common.none')}</option>
            {CLASS_SOCIETIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('project.classSocietyHint')}
          </span>
        </div>
      )}

      {error && (
        <p
          className="flex items-start gap-1.5 text-xs"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={13} className="mt-px flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button disabled={name.trim().length === 0 || create.isPending} onClick={submit}>
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
      </div>
    </div>
  )
}
