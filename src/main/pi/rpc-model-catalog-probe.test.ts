import { describe, expect, it, vi } from 'vitest'
import type { ProviderProcessLaunch } from '../provider-process/provider-process-launch'
import { createPiModelCatalogProbe, type PiModelCatalogProbeDeps } from './rpc-model-catalog-probe'

type ModelRow = Record<string, unknown>

/** A sessionless Pi that answers `get_available_models` and records its teardown. */
function fakeConnection(answer: () => Promise<unknown>) {
  return { request: vi.fn((_command: string) => answer()), close: vi.fn(async () => undefined) }
}

function modelsConnection(rows: ModelRow[]) {
  return fakeConnection(async () => ({ models: rows }))
}

const REASONING = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    reasoning: true,
    thinkingLevelMap: { max: 'max', xhigh: 'xhigh' }
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4',
    name: 'Claude Haiku 4',
    reasoning: true,
    thinkingLevelMap: { off: null, xhigh: null, max: 'max' }
  },
  { provider: 'openai', id: 'gpt-4o-mini', name: 'GPT-4o mini', reasoning: false }
]

function probeWith(overrides: Partial<PiModelCatalogProbeDeps> = {}) {
  return createPiModelCatalogProbe({
    resolveEnvironment: async () => ({ PATH: '/usr/bin', HOME: '/home/user', ORCA_PANE_KEY: 'p' }),
    resolveCommand: () => '/opt/pi/bin/pi',
    probeVersion: async () => ({ version: '0.84.0' }),
    homePath: '/home/user',
    ...overrides
  })
}

describe('Pi model catalog probe', () => {
  it('reports each model’s own thinking map, including max', async () => {
    const connection = modelsConnection(REASONING)
    const success = await probeWith({ openConnection: () => connection })(
      { variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' },
      {}
    )
    expect(success.origin).toBe('probe')
    expect(
      success.models.map((model) => [model.id, model.efforts.map(({ value }) => value)])
    ).toEqual([
      ['anthropic/claude-sonnet-4', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']],
      ['anthropic/claude-haiku-4', ['minimal', 'low', 'medium', 'high', 'max']],
      ['openai/gpt-4o-mini', []]
    ])
    expect(connection.request).toHaveBeenCalledWith('get_available_models')
    expect(connection.close).toHaveBeenCalledTimes(1)
  })

  it('probes a sessionless RPC chat under the pinned account with no caller identity', async () => {
    const launches: ProviderProcessLaunch[] = []
    const connection = modelsConnection(REASONING.slice(0, 1))
    const success = await probeWith({
      openConnection: (launch) => {
        launches.push(launch)
        return connection
      }
    })({ variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' }, {})
    expect(success.models).toHaveLength(1)
    expect(launches).toEqual([
      {
        command: '/opt/pi/bin/pi',
        cwd: '/home/user',
        args: ['--mode', 'rpc', '--no-session'],
        env: expect.objectContaining({
          PI_CODING_AGENT_DIR: '/homes/pi-a',
          PATH: '/usr/bin'
        }),
        envToDelete: expect.arrayContaining(['ORCA_PANE_KEY'])
      }
    ])
  })

  it('closes the connection when the probe fails, and never starts one when it cannot', async () => {
    const failing = fakeConnection(async () => {
      throw new Error('Pi exited before answering')
    })
    await expect(
      probeWith({ openConnection: () => failing })(
        { variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' },
        {}
      )
    ).rejects.toThrow('Pi exited before answering')
    expect(failing.close).toHaveBeenCalledTimes(1)

    const empty = modelsConnection([])
    await expect(
      probeWith({ openConnection: () => empty })(
        { variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' },
        {}
      )
    ).rejects.toThrow(/listed no models/)
    expect(empty.close).toHaveBeenCalledTimes(1)

    const openConnection = vi.fn(() => modelsConnection(REASONING))
    await expect(
      probeWith({
        openConnection,
        probeVersion: async () => ({ version: '0.83.9' })
      })({ variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' }, {})
    ).rejects.toThrow(/does not run structured chats/)
    expect(openConnection).not.toHaveBeenCalled()
  })

  it('stops and closes the connection when the launch is cancelled', async () => {
    const connection = fakeConnection(() => new Promise(() => {}))
    const stop = new AbortController()
    const probe = probeWith({
      openConnection: () => {
        queueMicrotask(() => stop.abort())
        return connection
      }
    })
    await expect(
      probe({ variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' }, { signal: stop.signal })
    ).rejects.toMatchObject({ reason: 'stopped' })
    expect(connection.close).toHaveBeenCalledTimes(1)

    const openConnection = vi.fn(() => connection)
    await expect(
      probeWith({ openConnection })(
        { variable: 'PI_CODING_AGENT_DIR', path: '/homes/pi-a' },
        {
          signal: AbortSignal.abort()
        }
      )
    ).rejects.toMatchObject({ reason: 'stopped' })
    expect(openConnection).not.toHaveBeenCalled()
  })
})
