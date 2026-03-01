import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
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
import { SwarmPage } from '@/pages/SwarmPage';
import { NodesPage } from '@/pages/NodesPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { ServiceDetailPage } from '@/pages/ServiceDetailPage';
import { StacksPage } from '@/pages/StacksPage';
import { RegistriesPage } from '@/pages/RegistriesPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { GitopsPage } from '@/pages/GitopsPage';
import { GitopsDetailPage } from '@/pages/GitopsDetailPage';
import { GitCredentialsPage } from '@/pages/GitCredentialsPage';
import { BackupPage } from '@/pages/BackupPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { TwoFactorPage } from '@/pages/TwoFactorPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
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
          {/* Swarm */}
          <Route path="swarm" element={<SwarmPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="services/:id" element={<ServiceDetailPage />} />
          <Route path="stacks" element={<StacksPage />} />
          {/* Platform */}
          <Route path="registries" element={<RegistriesPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="gitops" element={<GitopsPage />} />
          <Route path="gitops/credentials" element={<GitCredentialsPage />} />
          <Route path="gitops/:id" element={<GitopsDetailPage />} />
          {/* Enterprise */}
          <Route path="backup" element={<BackupPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="2fa" element={<TwoFactorPage />} />
          {/* Admin */}
          <Route path="users" element={<UsersPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="endpoints" element={<EndpointsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="activity-logs" element={<ActivityLogsPage />} />
          <Route path="auth-logs" element={<AuthLogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
