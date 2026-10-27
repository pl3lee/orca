import { removeAgentArgOption } from './agent-session-option-agent-args'
import type { AgentSessionOptionCatalog, CatalogOption } from './agent-session-option-catalog-types'

// Pi reports these levels verbatim in its RPC thinking map; keep labels equal to values so they match /thinking.
const PI_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

const PI_EFFORT: CatalogOption = {
  id: 'effort',
  label: 'Reasoning effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    choices: PI_THINKING_LEVELS.map((level) => ({ value: level, label: level })),
    defaultValue: 'medium'
  },
  apply: {
    launchArgs: (value) => ['--thinking', String(value)],
    removeAgentArgs: (tokens) => removeAgentArgOption('pi', tokens, ['--thinking']),
    midSession: { kind: 'command', build: (value) => `/thinking ${String(value)}` }
  }
}

export const PI_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  // Pi model ids depend on the account's saved providers and config; discovery controls membership.
  models: [],
  modelApply: {
    launchArgs: (value) => ['--model', String(value)],
    removeAgentArgs: (tokens) => removeAgentArgOption('pi', tokens, ['--model', '-m']),
    midSession: { kind: 'command', build: (value) => `/model ${String(value)}` }
  },
  unknownModelOptions: [PI_EFFORT],
  // Discovery must retire persisted ids no longer listed: --model fails launch on an unknown selector.
  discoveredModelsAreAuthoritative: true
}
