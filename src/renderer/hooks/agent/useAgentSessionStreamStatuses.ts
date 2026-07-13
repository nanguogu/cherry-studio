import { cacheService } from '@renderer/data/CacheService'
import { useSharedCache } from '@renderer/data/hooks/useCache'
import { buildAgentSessionTopicId } from '@renderer/utils/agentSession'
import { classifyTurn, type TopicStatusSnapshotEntry } from '@shared/ai/transport'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'

export type AgentSessionStreamState = {
  isPending: boolean
  status: TopicStatusSnapshotEntry['status']
}

export type AgentSessionHistoryStatusIds = {
  activeIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
}

const getAgentSessionStreamStatusCacheKey = (sessionId: string) =>
  `topic.stream.statuses.${buildAgentSessionTopicId(sessionId)}` as const
const SESSION_ID_SEPARATOR = '\u0000'
const EMPTY_AGENT_SESSION_STREAM_STATUSES = new Map<string, AgentSessionStreamState>()

type AgentSessionStreamStatusesSnapshot = {
  signature: string
  value: ReadonlyMap<string, AgentSessionStreamState>
}

function toAgentSessionStreamState(
  entry: TopicStatusSnapshotEntry | null | undefined
): AgentSessionStreamState | undefined {
  if (!entry) return undefined

  return {
    isPending: classifyTurn(entry.status).isTurnActive,
    status: entry.status
  }
}

function buildAgentSessionStreamStatusesSnapshot(sessionIds: readonly string[]): AgentSessionStreamStatusesSnapshot {
  const entries: Array<[string, AgentSessionStreamState]> = []

  for (const sessionId of sessionIds) {
    const entry = cacheService.getShared(getAgentSessionStreamStatusCacheKey(sessionId))
    const status = toAgentSessionStreamState(entry)
    if (status) entries.push([sessionId, status])
  }

  if (entries.length === 0) {
    return {
      signature: '',
      value: EMPTY_AGENT_SESSION_STREAM_STATUSES
    }
  }

  return {
    signature: entries
      .map(([sessionId, status]) => `${sessionId}:${status.status}:${status.isPending ? '1' : '0'}`)
      .join(SESSION_ID_SEPARATOR),
    value: new Map(entries)
  }
}

export function useAgentSessionStreamStatuses(
  sessionIds: readonly string[]
): ReadonlyMap<string, AgentSessionStreamState> {
  const sessionIdsKey = useMemo(() => Array.from(new Set(sessionIds)).sort().join(SESSION_ID_SEPARATOR), [sessionIds])
  const uniqueSessionIds = useMemo(
    () => (sessionIdsKey ? sessionIdsKey.split(SESSION_ID_SEPARATOR) : []),
    [sessionIdsKey]
  )
  const cacheKeys = useMemo(() => uniqueSessionIds.map(getAgentSessionStreamStatusCacheKey), [uniqueSessionIds])
  const snapshotRef = useRef<AgentSessionStreamStatusesSnapshot>({
    signature: '',
    value: EMPTY_AGENT_SESSION_STREAM_STATUSES
  })

  const getSnapshot = useCallback(() => {
    const nextSnapshot = buildAgentSessionStreamStatusesSnapshot(uniqueSessionIds)
    if (snapshotRef.current.signature === nextSnapshot.signature) {
      return snapshotRef.current.value
    }

    snapshotRef.current = nextSnapshot
    return nextSnapshot.value
  }, [uniqueSessionIds])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const disposers = cacheKeys.map((key) => cacheService.subscribe(key, onStoreChange))
      return () => disposers.forEach((dispose) => dispose())
    },
    [cacheKeys]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Main-owned, cross-window runtime index used by Agent History status filters.
 * SharedCache is intentionally non-durable: after an app restart both sets are
 * empty, so persisted sessions fall back to the completed History state. An id
 * may briefly outlive a deleted SQLite row; History's bounded id lookup simply
 * returns no row, making that stale entry harmless until a lifecycle update or
 * app restart.
 */
export function useAgentSessionHistoryStatusIds(): AgentSessionHistoryStatusIds {
  const [statusIds] = useSharedCache('agent.session.stream.status_ids')

  return useMemo(
    () => ({ activeIds: new Set(statusIds.activeIds), failedIds: new Set(statusIds.failedIds) }),
    [statusIds]
  )
}
