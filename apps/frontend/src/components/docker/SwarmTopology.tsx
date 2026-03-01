import { cn } from '@/lib/utils';
import { Server, Crown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface SwarmNode {
  ID: string;
  Description?: { Hostname?: string; Platform?: { OS?: string; Architecture?: string } };
  Spec?: { Role?: string; Availability?: string; Labels?: Record<string, string> };
  Status?: { State?: string; Addr?: string };
  ManagerStatus?: { Leader?: boolean; Reachability?: string; Addr?: string };
}

interface SwarmTopologyProps {
  nodes: SwarmNode[];
  className?: string;
}

export function SwarmTopology({ nodes, className }: SwarmTopologyProps) {
  const managers = nodes.filter((n) => n.Spec?.Role === 'manager');
  const workers = nodes.filter((n) => n.Spec?.Role === 'worker');

  return (
    <div className={cn('space-y-6', className)}>
      {/* Managers */}
      {managers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Managers ({managers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managers.map((node) => (
              <NodeCard key={node.ID} node={node} />
            ))}
          </div>
        </div>
      )}

      {/* Workers */}
      {workers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Workers ({workers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.map((node) => (
              <NodeCard key={node.ID} node={node} />
            ))}
          </div>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No nodes found. This endpoint may not be part of a swarm.
        </div>
      )}
    </div>
  );
}

function NodeCard({ node }: { node: SwarmNode }) {
  const isLeader = node.ManagerStatus?.Leader === true;
  const hostname = node.Description?.Hostname || node.ID.slice(0, 12);
  const state = node.Status?.State || 'unknown';
  const availability = node.Spec?.Availability || 'active';
  const role = node.Spec?.Role || 'worker';
  const addr = node.Status?.Addr || '';
  const platform = node.Description?.Platform;

  return (
    <div
      className={cn(
        'border rounded-lg p-4 bg-card space-y-3',
        isLeader && 'border-blue-500/50',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isLeader ? (
            <Crown className="w-4 h-4 text-yellow-500" />
          ) : (
            <Server className="w-4 h-4 text-muted-foreground" />
          )}
          <div>
            <div className="font-medium text-sm">{hostname}</div>
            {addr && <div className="text-xs text-muted-foreground">{addr}</div>}
          </div>
        </div>
        <StatusBadge status={state} />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={cn(
          'text-xs px-2 py-0.5 rounded',
          role === 'manager' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700',
        )}>
          {role}
        </span>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded',
          availability === 'active' ? 'bg-green-100 text-green-800'
            : availability === 'drain' ? 'bg-orange-100 text-orange-800'
            : 'bg-yellow-100 text-yellow-800',
        )}>
          {availability}
        </span>
        {isLeader && (
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">leader</span>
        )}
      </div>

      {platform && (
        <div className="text-xs text-muted-foreground">
          {platform.OS}/{platform.Architecture}
        </div>
      )}

      <div className="text-xs text-muted-foreground font-mono">{node.ID.slice(0, 12)}</div>
    </div>
  );
}
