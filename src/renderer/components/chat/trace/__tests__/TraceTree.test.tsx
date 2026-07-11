import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TraceNode } from '../traceNode'
import TraceTree from '../TraceTree'

describe('TraceTree', () => {
  it('defers rendering for off-screen trace nodes', () => {
    const node = {
      id: 'trace-node',
      name: 'Trace node',
      status: 'OK',
      startTime: 0,
      endTime: 10,
      percent: 100,
      start: 0,
      children: []
    } as unknown as TraceNode

    const { container } = render(<TraceTree node={node} handleClick={vi.fn()} />)

    expect(container.firstElementChild).toHaveStyle({
      contentVisibility: 'auto',
      containIntrinsicSize: 'auto 32px'
    })
  })
})
