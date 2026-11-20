import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// One line above the top bar while a /demo visitor is signed in, so nobody
// mistakes the fictional boat for real data, and the way to talk to us is
// always one click away.
export default function DemoBanner() {
  const { user } = useAuth()
  if (!user?.isDemo) return null
  return (
    <div
      role="note"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs"
      style={{ backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}
    >
      <span>
        Demo: S/Y Tessera and everyone on her are fictional. Your copy is private and cleared after 24 hours.
      </span>
      <Link to="/#contact" className="font-semibold underline underline-offset-2">
        Talk about your boat
      </Link>
    </div>
  )
}
