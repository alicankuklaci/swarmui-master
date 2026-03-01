export interface AppSettings {
  id: string;
  allowLocalAdminPassword: boolean;
  authenticationMethod: 'local' | 'ldap' | 'oauth';
  logoUrl?: string;
  loginBannerMessage?: string;
  sessionLifetime: number;
  snapshotInterval: number;
  displayExternalContributors: boolean;
  enableTelemetry: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsRequest {
  allowLocalAdminPassword?: boolean;
  authenticationMethod?: 'local' | 'ldap' | 'oauth';
  logoUrl?: string;
  loginBannerMessage?: string;
  sessionLifetime?: number;
  snapshotInterval?: number;
  enableTelemetry?: boolean;
}
