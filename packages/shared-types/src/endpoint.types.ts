export type EndpointType = 'local' | 'tcp' | 'tls' | 'agent';
export type EndpointStatus = 'active' | 'inactive' | 'error';

export interface Endpoint {
  id: string;
  name: string;
  type: EndpointType;
  url: string;
  status: EndpointStatus;
  dockerVersion?: string;
  swarmEnabled: boolean;
  groupId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEndpointRequest {
  name: string;
  type: EndpointType;
  url: string;
  groupId?: string;
  tags?: string[];
  tls?: {
    caCert?: string;
    cert?: string;
    key?: string;
  };
}

export interface UpdateEndpointRequest {
  name?: string;
  url?: string;
  groupId?: string;
  tags?: string[];
}

export interface EndpointConnectionTest {
  success: boolean;
  dockerVersion?: string;
  swarmEnabled?: boolean;
  error?: string;
}
