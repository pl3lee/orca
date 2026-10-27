import { homedir } from 'node:os'
import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { resolveCliCommand } from '../../shared/node-cli-command-resolution'
import type { AgentCliVersionReader } from '../agent-cli-version-probe'
import { JsonlRpcAgentConnection } from '../jsonl-rpc/agent-connection'
import type {
  AgentModelCatalogProbe,
  AgentModelCatalogSuccess
} from '../native-chat/agent-model-catalog/agent-model-catalog-store'
import { runAgentModelCatalogSession } from '../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import type { StructuredAgentCommandSettings } from '../native-chat/structured-agent-command-resolution'
import type { ProviderProcessLaunch } from '../provider-process/provider-process-launch'
import { piRpcSessionlessEnvironment } from './rpc-launch'
import { checkPiRpcVersion, resolvePiRpcInvocation } from './rpc-launch-resolution'
import { readPiRpcModelCatalog, type PiRpcRequester } from './rpc-options'

/** The shared catalog runner owns teardown; the probe only needs requests and close. */
export type PiModelCatalogProbeConnection = PiRpcRequester & { close(): Promise<unknown> }

export type PiModelCatalogProbeDeps = {
  resolveEnvironment: () => Promise<NodeJS.ProcessEnv>
  /** Refresh once on a missing Pi binary; absent disables retry. */
  refreshEnvironmentAfterMiss?: (askedAt: number) => Promise<void>
  resolveCommandSettings?: () => StructuredAgentCommandSettings
  resolveCommand?: typeof resolveCliCommand
  probeVersion?: AgentCliVersionReader
  openConnection?: (launch: ProviderProcessLaunch) => PiModelCatalogProbeConnection
  homePath?: string
}

/** Pi lists efforts only over RPC; a sessionless chat reports each model's own thinking map. */
export function createPiModelCatalogProbe(deps: PiModelCatalogProbeDeps): AgentModelCatalogProbe {
  return async (accountHome, options): Promise<AgentModelCatalogSuccess> => {
    const cwd = deps.homePath ?? homedir()
    const { env, command } = await resolvePiRpcInvocation({
      accountDir: requireLegacyAgentSessionAccountHome(accountHome).path,
      resolveEnvironment: deps.resolveEnvironment,
      commandSettings: deps.resolveCommandSettings?.(),
      resolveCommand: deps.resolveCommand,
      refreshEnvironmentAfterMiss: deps.refreshEnvironmentAfterMiss,
      resolveWorkingDirectory: () => cwd
    })
    if ((await checkPiRpcVersion({ command, cwd, env }, deps.probeVersion)).status === 'tooOld') {
      throw new Error(`pi at ${command} does not run structured chats`)
    }
    const launch: ProviderProcessLaunch = {
      command,
      cwd,
      args: ['--mode', 'rpc', '--no-session'],
      ...piRpcSessionlessEnvironment(env)
    }
    const open: (spec: ProviderProcessLaunch) => PiModelCatalogProbeConnection =
      deps.openConnection ?? ((spec) => new JsonlRpcAgentConnection(spec))
    const models = await runAgentModelCatalogSession(
      () => open(launch),
      (connection) => readPiRpcModelCatalog(connection),
      { label: 'pi', signal: options?.signal }
    )
    if (models.length === 0) {
      throw new Error('pi listed no models')
    }
    return { models, origin: 'probe' }
  }
}
