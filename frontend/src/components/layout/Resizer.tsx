import { useRef, useCallback } from 'react'

interface Props {
  onResize: (delta: number) => void
}

/** Draggable vertical divider between left and right panels. */
export function Resizer({ onResize }: Props) {
  const dragging = useRef(false)
  const lastX    = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onResize(ev.clientX - lastX.current)
      lastX.current = ev.clientX
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onResize])

  return (
    <div style={S.divider} onMouseDown={onMouseDown} title="Drag to resize">
      <div style={S.grip} />
    </div>
  )
}

const S = {
  divider: {
    width: 8,
    flexShrink: 0,
    cursor: 'col-resize',
    background: 'transparent',
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grip: {
    width: 4,
    height: 36,
    borderRadius: 2,
    background: 'var(--border-color)',
    opacity: 0.7,
  },
}
