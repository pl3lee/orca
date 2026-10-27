import { describe, expect, it } from 'vitest'

import { countBlockingCalls, isScannedPath } from './check-daemon-blocking-call-ratchet.mjs'

const count = (source) => countBlockingCalls('src/main/daemon/example.ts', source)

describe('countBlockingCalls', () => {
  it('counts synchronous file writes through named, namespace and default imports', () => {
    expect(
      count(
        "import { appendFileSync } from 'node:fs'\nimport * as fs from 'fs'\nimport nodeFs from 'node:fs'\n" +
          'appendFileSync(p, line)\nfs.writeSync(fd, line)\nnodeFs.appendFileSync(p, line)'
      )
    ).toBe(3)
  })

  it('counts synchronous child-process launches', () => {
    expect(
      count(
        "import { execFileSync, spawnSync } from 'node:child_process'\nimport { runProcessSync } from '@orca/process-host'\n" +
          "execFileSync('ps')\nspawnSync('ps')\nrunProcessSync({ program: 'ps' })"
      )
    ).toBe(3)
  })

  it('ignores same-named methods on other objects and other fs calls', () => {
    expect(
      count(
        "import { writeFileSync } from 'node:fs'\nemulator.writeSync(chunk)\nwriter.writeSync(save)\nwriteFileSync(p, x)"
      )
    ).toBe(0)
  })
})

describe('isScannedPath', () => {
  it('scans production sources only', () => {
    expect(isScannedPath('src/main/daemon/daemon-file-log.ts')).toBe(true)
    expect(isScannedPath('src/main/daemon/daemon-file-log.test.ts')).toBe(false)
    expect(isScannedPath('src/main/daemon/types.d.ts')).toBe(false)
  })
})
