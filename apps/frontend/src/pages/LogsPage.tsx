import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityLogsPage } from '@/pages/ActivityLogsPage';
import { AuthLogsPage } from '@/pages/AuthLogsPage';
import AuditLogPage from '@/pages/AuditLogPage';
import { EventsPage } from '@/pages/EventsPage';

/**
 * Unified /logs page: four tabs that reuse the existing page components.
 * - audit    → request-level audit trail (admin)
 * - activity → user action log  (admin)
 * - auth     → login/2FA log   (admin)
 * - events   → live docker events feed
 *
 * The active tab is persisted in `?tab=` so refresh and shareable links
 * both work. Legacy routes (/audit-log, /activity-logs, /auth-logs, /events)
 * redirect here with the matching tab.
 */
const TABS = ['audit', 'activity', 'auth', 'events'] as const;
type TabKey = (typeof TABS)[number];

export function LogsPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'audit';

  function onChange(next: string) {
    const n = new URLSearchParams(params);
    n.set('tab', next);
    setParams(n, { replace: true });
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Logs"
        description="One place for audit, activity, auth, and live Docker events."
      />
      <Tabs value={tab} onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>
        <TabsContent value="audit"><AuditLogPage /></TabsContent>
        <TabsContent value="activity"><ActivityLogsPage /></TabsContent>
        <TabsContent value="auth"><AuthLogsPage /></TabsContent>
        <TabsContent value="events"><EventsPage /></TabsContent>
      </Tabs>
    </div>
  );
}
