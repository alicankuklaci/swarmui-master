export type UserRole = 'admin' | 'operator' | 'helpdesk' | 'standard' | 'readonly';
export type AuthProvider = 'local' | 'oauth' | 'ldap';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  forceChangePassword: boolean;
  isActive: boolean;
  authProvider: AuthProvider;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
