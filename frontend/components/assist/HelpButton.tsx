'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { HelpCircle, Ban, Flag, HeartHandshake, MessageSquare, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'
import ContactSupportModal from '@/components/ui/ContactSupportModal'

// "Hilfe" ist bei Assistenz-Mandanten (theme.layout.assist) immer sichtbar:
// erklaert Blockieren und Melden in Alltagssprache und fuehrt zur Betreuung.
export function HelpButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { theme, modules } = useTenant()
  const [open, setOpen] = useState(false)
  const [support, setSupport] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  if (!theme.layout.assist) return null

  const items = [
    { Icon: Ban, title: t.assist.helpBlock, desc: t.assist.helpBlockDesc, href: '/chat' },
    { Icon: Flag, title: t.assist.helpReport, desc: t.assist.helpReportDesc, href: '/chat' },
    ...(modules.caretaker ? [{ Icon: HeartHandshake, title: t.assist.helpCare, desc: t.assist.helpCareDesc, href: '/care' }] : []),
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FFF3B0] px-3.5 py-2 text-sm font-bold text-[#3D2E00] shadow-[inset_0_0_0_2px_#3D2E00] ${className}`}
      >
        <HelpCircle size={18} aria-hidden /> {t.assist.help}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-on-surface backdrop:bg-black/50"
        aria-labelledby="help-title"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="help-title" className="text-2xl">{t.assist.helpTitle}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.assist.close} className="rounded-full p-2 hover:bg-surface-container">
              <X aria-hidden />
            </button>
          </div>
          <p className="whitespace-pre-line text-lg">{t.assist.helpIntro}</p>
          <ul className="space-y-3" role="list">
            {items.map(({ Icon, title, desc, href }) => (
              <li key={title}>
                <Link href={href} onClick={() => setOpen(false)} className="flex items-center gap-4 rounded-2xl bg-surface-container p-4 hover:bg-surface-container-high">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-fixed-dim text-on-primary-container" aria-hidden="true">
                    <Icon size={24} />
                  </span>
                  <span>
                    <span className="block text-lg font-bold">{title}</span>
                    <span className="block text-on-surface-variant">{desc}</span>
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { setOpen(false); setSupport(true) }} className="flex w-full items-center gap-4 rounded-2xl bg-surface-container p-4 text-left hover:bg-surface-container-high">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tertiary-fixed-dim text-background" aria-hidden="true">
                  <MessageSquare size={24} />
                </span>
                <span>
                  <span className="block text-lg font-bold">{t.assist.helpSupport}</span>
                  <span className="block text-on-surface-variant">{t.assist.helpSupportDesc}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </dialog>
      {support && <ContactSupportModal onClose={() => setSupport(false)} />}
    </>
  )
}
