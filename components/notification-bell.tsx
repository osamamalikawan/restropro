'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

/**
 * Topbar bell. Polls the unread count every 60s and on route change /
 * tab refocus, so marking things read on the notifications page updates it.
 */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (alive) setUnread(json.unreadCount ?? 0)
      } catch {
        /* offline — keep the last known count */
      }
    }

    load()
    const interval = setInterval(load, 60_000)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      clearInterval(interval)
      window.removeEventListener('focus', load)
    }
  }, [pathname])

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-mid transition hover:bg-raised hover:text-ink-strong"
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
