import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-green-100 text-green-800' },
  stopped: { label: 'Stopped', className: 'bg-gray-100 text-gray-700' },
  exited: { label: 'Exited', className: 'bg-red-100 text-red-800' },
  paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-800' },
  restarting: { label: 'Restarting', className: 'bg-blue-100 text-blue-800' },
  created: { label: 'Created', className: 'bg-purple-100 text-purple-800' },
  dead: { label: 'Dead', className: 'bg-red-200 text-red-900' },
  removing: { label: 'Removing', className: 'bg-orange-100 text-orange-800' },
  // Swarm node states
  active: { label: 'Active', className: 'bg-green-100 text-green-800' },
  pause: { label: 'Paused', className: 'bg-yellow-100 text-yellow-800' },
  drain: { label: 'Drain', className: 'bg-orange-100 text-orange-800' },
  ready: { label: 'Ready', className: 'bg-green-100 text-green-800' },
  down: { label: 'Down', className: 'bg-red-100 text-red-800' },
  disconnected: { label: 'Disconnected', className: 'bg-gray-100 text-gray-700' },
  // Service/task states
  complete: { label: 'Complete', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  starting: { label: 'Starting', className: 'bg-blue-100 text-blue-800' },
  shutdown: { label: 'Shutdown', className: 'bg-gray-100 text-gray-700' },
  rejected: { label: 'Rejected', className: 'bg-red-200 text-red-900' },
  orphaned: { label: 'Orphaned', className: 'bg-orange-100 text-orange-800' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status?.toLowerCase()] || {
    label: status || 'Unknown',
    className: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.className,
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {config.label}
    </span>
  );
}
