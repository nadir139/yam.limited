import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useProject } from '@/lib/query-hooks'

interface TopbarProps {
  onMenuClick: () => void
}

const PHASE_DISPLAY: Record<string, string> = {
  PRE_SURVEY: 'PRE SURVEY',
  HAUL_OUT: 'HAUL OUT',
  STRUCTURAL: 'STRUCTURAL',
  SYSTEMS: 'SYSTEMS',
  INTERIOR: 'INTERIOR',
  SEA_TRIALS: 'SEA TRIALS',
  DELIVERED: 'DELIVERED',
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { data: project } = useProject()
  const phase = project?.phase ?? ''
  const phaseLabel = PHASE_DISPLAY[phase] ?? phase.replace(/_/g, ' ')

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

      {/* Center: project info */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: '15px',
              lineHeight: 1.2,
              color: 'hsl(var(--foreground))',
            }}
          >
            Project ZERO
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'hsl(var(--muted-foreground))',
              lineHeight: 1.2,
            }}
          >
            55m Ketch · RINA
          </div>
        </div>
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
            {phaseLabel}
          </Badge>
        )}
        <ThemeToggle />
      </div>
    </div>
  )
}
