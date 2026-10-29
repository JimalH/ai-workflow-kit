import type { ClientModule } from 'claude-code'

// The middle of the band's row, drawn by the surface itself so it can move without the band
// redrawing: the switches that are on, slid one cell at a time when they do not fit, or,
// while a feature works, its own line with a band of light sweeping over it (as the file
// tree's rows shimmer).

export type MiddleProps = {
  /** The switches on, `● Auto-handoff  ● Fix English`. */
  list: string
  /** What a feature is doing now, `◷ Fix English · checking… 3s`; '' when idle. */
  working: string
  /** The cells the region has. */
  width: number
}

type Local = { phase: number; offset: number; ref: { stop?: () => void; slide?: () => void } }

const SHIMMER_MS = 90
const SLIDE_MS = 350
// Amber, dim to bright, the light's four steps.
const AMBER = ['#9a7a3a', '#c49a4a', '#e2a94e', '#ffd98a']
const GREEN = '#4caf6e'

function shimmer(i: number, phase: number, len: number, palette: string[]): string {
  const band = ((phase * 1.6) % (len + 8)) - 4
  const d = Math.abs(i - band)
  return palette[d < 0.8 ? 3 : d < 1.8 ? 2 : d < 2.8 ? 1 : 0] ?? palette[0] ?? '#e2a94e'
}

const Middle: ClientModule<MiddleProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { phase: 0, offset: 0, ref: {} }
    surface.setState(state)
  }
  const width = Math.max(1, props.width || surface.columns)
  const isWorking = props.working !== ''
  const slides = !isWorking && props.list.length > width

  // The light runs only while a feature works; the list slides only while it does not fit.
  if (isWorking && !state.ref.stop) {
    state.ref.stop = surface.every(SHIMMER_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: cur.phase + 1 })
    })
  } else if (!isWorking && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }
  if (slides && !state.ref.slide) {
    state.ref.slide = surface.every(SLIDE_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, offset: cur.offset + 1 })
    })
  } else if (!slides && state.ref.slide) {
    state.ref.slide()
    state.ref.slide = undefined
  }

  if (isWorking) {
    const chars = [...props.working].slice(0, width)
    return (
      <Box height={1} overflow="hidden">
        <Text>
          {chars.map((ch, i) => (
            <Text color={shimmer(i, state.phase, chars.length, AMBER)}>{ch}</Text>
          ))}
        </Text>
      </Box>
    )
  }

  // A window of `width` cells over the list, a gap, and the list again.
  const text = (() => {
    if (!slides) return props.list
    const loop = `${props.list}   `
    const start = state.offset % loop.length
    return (loop + loop).slice(start, start + width)
  })()
  // Dots green, names plain: the text split at its dots.
  const parts = text.split('●')
  return (
    <Box height={1} overflow="hidden">
      <Text>
        {parts.map((part, i) => (
          <Text>
            {i > 0 ? <Text color={GREEN}>●</Text> : null}
            {part}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

export default Middle
