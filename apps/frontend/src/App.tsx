import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAutoSelectEndpoint } from '@/hooks/useDocker';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UsersPage } from '@/pages/UsersPage';
import { TeamsPage } from '@/pages/TeamsPage';
import { RolesPage } from '@/pages/RolesPage';
import { EndpointsPage } from '@/pages/EndpointsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ActivityLogsPage } from '@/pages/ActivityLogsPage';
import { AuthLogsPage } from '@/pages/AuthLogsPage';
import { ContainersPage } from '@/pages/ContainersPage';
import { ContainerDetailPage } from '@/pages/ContainerDetailPage';
import { ImagesPage } from '@/pages/ImagesPage';
import { NetworksPage } from '@/pages/NetworksPage';
import { VolumesPage } from '@/pages/VolumesPage';
import AuditLogPage from '@/pages/AuditLogPage';
import { ClusterVisualizerPage } from './pages/ClusterVisualizerPage';
import { SwarmPage } from '@/pages/SwarmPage';
import { NodesPage } from '@/pages/NodesPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { ServiceDetailPage } from '@/pages/ServiceDetailPage';
import { StacksPage } from '@/pages/StacksPage';
import { StackDetailPage } from '@/pages/StackDetailPage';
import { RegistriesPage } from '@/pages/RegistriesPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { GitopsPage } from '@/pages/GitopsPage';
import { GitopsDetailPage } from '@/pages/GitopsDetailPage';
import { GitCredentialsPage } from '@/pages/GitCredentialsPage';
import { BackupPage } from '@/pages/BackupPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { TwoFactorPage } from '@/pages/TwoFactorPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { EventsPage } from '@/pages/EventsPage';
import { MonitoringOverviewPage } from '@/pages/monitoring/MonitoringOverviewPage';
import { LiveMonitoringPage } from '@/pages/monitoring/LiveMonitoringPage';
import { NodeDetailPage as MonitoringNodeDetailPage } from '@/pages/monitoring/NodeDetailPage';
import { ContainersMonitoringPage } from '@/pages/monitoring/ContainersMonitoringPage';
import { ContainerDetailPage as MonitoringContainerDetailPage } from '@/pages/monitoring/ContainerDetailPage';
import { UptimeChecksPage } from '@/pages/monitoring/UptimeChecksPage';
import { UptimeCheckDetailPage } from '@/pages/monitoring/UptimeCheckDetailPage';
import { AlarmRulesPage } from '@/pages/monitoring/AlarmRulesPage';
import { AlarmsPage } from '@/pages/monitoring/AlarmsPage';
import { AlarmDetailPage } from '@/pages/monitoring/AlarmDetailPage';
import { NotificationChannelsPage } from '@/pages/notifications/NotificationChannelsPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RoleRoute } from '@/components/auth/RoleRoute';

import React from 'react';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto" role="alert">
          <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <button
              className="px-4 py-2 border rounded hover:bg-accent transition-colors"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AutoEndpoint() {
  useAutoSelectEndpoint();
  return null;
}

// Admin-only wrapper around a route element.
function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute allow={['admin']}>{children}</RoleRoute>;
}

// Admin + operator for observability pages.
function OpsRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute allow={['admin', 'operator']}>{children}</RoleRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200}>
        <ConfirmProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AutoEndpoint />
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                element={
                  <ErrorBoundary>
                    <Outlet />
                  </ErrorBoundary>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                {/* Docker */}
                <Route path="containers" element={<ContainersPage />} />
                <Route path="containers/:id" element={<ContainerDetailPage />} />
                <Route path="images" element={<ImagesPage />} />
                <Route path="networks" element={<NetworksPage />} />
                <Route path="volumes" element={<VolumesPage />} />
                <Route path="events" element={<EventsPage />} />
                {/* Swarm */}
                <Route path="swarm" element={<SwarmPage />} />
                <Route path="nodes" element={<NodesPage />} />
                <Route path="visualizer" element={<ClusterVisualizerPage />} />
                <Route path="audit-log" element={<AuditLogPage />} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="services/:id" element={<ServiceDetailPage />} />
                <Route path="stacks" element={<StacksPage />} />
                <Route path="stacks/:name" element={<StackDetailPage />} />
                {/* Platform */}
                <Route path="registries" element={<RegistriesPage />} />
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="gitops" element={<GitopsPage />} />
                <Route path="gitops/credentials" element={<GitCredentialsPage />} />
                <Route path="gitops/:id" element={<GitopsDetailPage />} />
                {/* Observability */}
                <Route path="monitoring" element={<OpsRoute><MonitoringOverviewPage /></OpsRoute>} />
                <Route path="monitoring/live" element={<OpsRoute><LiveMonitoringPage /></OpsRoute>} />
                <Route path="monitoring/nodes/:nodeId" element={<OpsRoute><MonitoringNodeDetailPage /></OpsRoute>} />
                <Route path="monitoring/containers" element={<OpsRoute><ContainersMonitoringPage /></OpsRoute>} />
                <Route path="monitoring/containers/:id" element={<OpsRoute><MonitoringContainerDetailPage /></OpsRoute>} />
                <Route path="monitoring/uptime" element={<OpsRoute><UptimeChecksPage /></OpsRoute>} />
                <Route path="monitoring/uptime/:id" element={<OpsRoute><UptimeCheckDetailPage /></OpsRoute>} />
                <Route path="monitoring/rules" element={<OpsRoute><AlarmRulesPage /></OpsRoute>} />
                <Route path="monitoring/alarms" element={<OpsRoute><AlarmsPage /></OpsRoute>} />
                <Route path="monitoring/alarms/:id" element={<OpsRoute><AlarmDetailPage /></OpsRoute>} />
                <Route path="notifications/channels" element={<OpsRoute><NotificationChannelsPage /></OpsRoute>} />
                {/* Enterprise */}
                <Route path="backup" element={<BackupPage />} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="api-keys" element={<AdminRoute><ApiKeysPage /></AdminRoute>} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="2fa" element={<TwoFactorPage />} />
                {/* Admin */}
                <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="teams" element={<AdminRoute><TeamsPage /></AdminRoute>} />
                <Route path="roles" element={<AdminRoute><RolesPage /></AdminRoute>} />
                <Route path="endpoints" element={<AdminRoute><EndpointsPage /></AdminRoute>} />
                <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
                <Route path="activity-logs" element={<AdminRoute><ActivityLogsPage /></AdminRoute>} />
                <Route path="auth-logs" element={<AdminRoute><AuthLogsPage /></AdminRoute>} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster />
        </ConfirmProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}
