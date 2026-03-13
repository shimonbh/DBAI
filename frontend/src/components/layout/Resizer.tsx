import { useRef, useCallback } from 'react'
import { theme } from '@/theme'

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
    <div
      style={styles.divider}
      onMouseDown={onMouseDown}
      title="Drag to resize"
    />
  )
}

const styles = {
  divider: {
    width: 4,
    cursor: 'col-resize',
    background: theme.borderColor,
    flexShrink: 0,
    transition: 'background 0.1s',
  },
}
