import { describe, expect, it } from 'vitest'
import { getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import { PI_SESSION_OPTION_CATALOG } from './agent-session-option-catalog-pi'
import {
  removeOverriddenAgentSessionArgs,
  resolveAgentSessionOptionLaunch
} from './agent-session-option-launch'

function piEffortOption() {
  const effort = PI_SESSION_OPTION_CATALOG.unknownModelOptions?.find(({ id }) => id === 'effort')
  if (!effort) {
    throw new Error('pi must offer effort for the models discovery lists')
  }
  return effort
}

describe('pi session option catalog', () => {
  it('is registered for pi', () => {
    expect(getAgentSessionOptionCatalog('pi')).toBe(PI_SESSION_OPTION_CATALOG)
  })

  it('launches a picked model and effort as --model then --thinking', () => {
    expect(
      resolveAgentSessionOptionLaunch('pi', {
        model: 'opencode-go/deepseek-v4.1-flash',
        effort: 'max'
      })
    ).toEqual({
      args: ['--model', 'opencode-go/deepseek-v4.1-flash', '--thinking', 'max'],
      appliedValues: { model: 'opencode-go/deepseek-v4.1-flash', effort: 'max' }
    })
  })

  it("offers pi's full thinking ladder and defaults effort to medium", () => {
    const effort = piEffortOption()
    expect(effort.kind).toMatchObject({ type: 'select', defaultValue: 'medium' })
    expect(effort.kind.type === 'select' ? effort.kind.choices : []).toEqual([
      { value: 'off', label: 'off' },
      { value: 'minimal', label: 'minimal' },
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
      { value: 'xhigh', label: 'xhigh' },
      { value: 'max', label: 'max' }
    ])
  })

  it('strips the overridden model, and the effort when one is picked, keeping unrelated args', () => {
    expect(
      removeOverriddenAgentSessionArgs('pi', { model: 'x' }, [
        '-m',
        'y',
        '--thinking',
        'low',
        '--foo'
      ])
    ).toEqual(['--thinking', 'low', '--foo'])
    expect(
      removeOverriddenAgentSessionArgs('pi', { model: 'x', effort: 'high' }, [
        '-m',
        'y',
        '--thinking',
        'low',
        '--foo'
      ])
    ).toEqual(['--foo'])
  })

  it('applies a picked effort to an unlisted model and drops an unknown tier', () => {
    expect(
      resolveAgentSessionOptionLaunch('pi', { model: 'acme/unlisted', effort: 'max' })
    ).toEqual({
      args: ['--model', 'acme/unlisted', '--thinking', 'max'],
      appliedValues: { model: 'acme/unlisted', effort: 'max' }
    })
    expect(
      resolveAgentSessionOptionLaunch('pi', { model: 'acme/unlisted', effort: 'ultra' })
    ).toEqual({ args: ['--model', 'acme/unlisted'], appliedValues: { model: 'acme/unlisted' } })
  })
})
