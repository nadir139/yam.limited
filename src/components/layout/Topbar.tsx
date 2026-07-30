import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ThemeToggle'
import LanguagePicker from '@/components/LanguagePicker'
import ProjectSwitcher from './ProjectSwitcher'
import { useActiveProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/lib/i18n'

interface TopbarProps {
  onMenuClick: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { activeProject } = useActiveProject()
  const { t } = useTranslation()
  const phase = activeProject?.phase
  const phaseLabel = phase ? t(`phase.${phase}`) : ''

  return (
    <div
      style={{
        height: '56px',
        background: 'hsl(var(--background))',
        borderBottom: '1px solid hsl(var(--border))',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="md:hidden"
        style={{ flexShrink: 0 }}
      >
        <Menu size={20} />
        <span className="sr-only">Open menu</span>
      </Button>

      {/* Center: which project, and how to leave it */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <ProjectSwitcher />
      </div>

      {/* Right: phase badge + theme toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {phaseLabel && (
          <Badge
            style={{
              backgroundColor: 'hsl(185 60% 40% / 0.12)',
              color: 'hsl(185 60% 35%)',
              border: '1px solid hsl(185 60% 40% / 0.3)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '3px 8px',
            }}
          >
            {phaseLabel.toUpperCase()}
          </Badge>
        )}
        <LanguagePicker />
        <ThemeToggle />
      </div>
    </div>
  )
}
