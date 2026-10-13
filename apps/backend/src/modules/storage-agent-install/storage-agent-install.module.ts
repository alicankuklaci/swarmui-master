import { Module } from '@nestjs/common';
import { StorageAgentInstallController } from './storage-agent-install.controller';
import { InstallTokenStore } from './install-token.store';
import { InstallTokenGuard } from './install-token.guard';
import { AgentProbeService } from './agent-probe.service';

// Always-on operator-setup module. Loaded unconditionally in AppModule so the
// admin-issued install one-liner works even when FEATURE_SHARED_STORAGE is
// still false — the point is to bring agents online BEFORE enabling the
// module they serve. Depends on the @Global DockerModule for swarm access
// (listNodes); no DB.
@Module({
  controllers: [StorageAgentInstallController],
  providers: [InstallTokenStore, InstallTokenGuard, AgentProbeService],
})
export class StorageAgentInstallModule {}
