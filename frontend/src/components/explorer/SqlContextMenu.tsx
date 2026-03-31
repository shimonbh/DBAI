import { useEffect, useRef } from 'react'
import { theme } from '@/theme'

export interface SqlMenuItem {
  label: string
  action: () => void
}

interface Props {
  items: SqlMenuItem[]
  anchor: DOMRect
  onClose: () => void
}

/** Floating SQL action menu anchored below a button. */
export function SqlContextMenu({ items, anchor, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      style={{
        position:     'fixed',
        top:          anchor.bottom + 2,
        left:         anchor.left,
        background:   theme.bgPanel,
        border:       `1px solid ${theme.borderColor}`,
        borderRadius: 5,
        boxShadow:    '0 4px 14px rgba(0,0,0,0.45)',
        zIndex:       2000,
        minWidth:     110,
        overflow:     'hidden',
      }}
    >
      {items.map(item => (
        <div
          key={item.label}
          onMouseDown={e => { e.stopPropagation(); item.action(); onClose() }}
          style={menuItemStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme.bgSecondary }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  padding:    '7px 14px',
  fontSize:   12,
  color:      theme.textPrimary,
  cursor:     'pointer',
  background: 'transparent',
  userSelect: 'none',
}
