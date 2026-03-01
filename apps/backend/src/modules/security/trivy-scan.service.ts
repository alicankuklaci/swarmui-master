import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TrivyScanResult {
  image: string;
  scannedAt: Date;
  available: boolean;
  vulnerabilities?: TrivyVulnerability[];
  summary?: { critical: number; high: number; medium: number; low: number; unknown: number };
  error?: string;
}

export interface TrivyVulnerability {
  id: string;
  severity: string;
  pkg: string;
  version: string;
  fixedVersion?: string;
  title: string;
}

@Injectable()
export class TrivyScanService {
  private readonly logger = new Logger(TrivyScanService.name);
  private trivyAvailable: boolean | null = null;

  async isTrivyAvailable(): Promise<boolean> {
    if (this.trivyAvailable !== null) return this.trivyAvailable;
    try {
      await execAsync('trivy --version');
      this.trivyAvailable = true;
    } catch {
      this.trivyAvailable = false;
    }
    return this.trivyAvailable;
  }

  async scanImage(image: string): Promise<TrivyScanResult> {
    const available = await this.isTrivyAvailable();
    if (!available) {
      this.logger.warn('Trivy not available, returning mock result');
      return {
        image,
        scannedAt: new Date(),
        available: false,
        error: 'Trivy CLI not installed. Install trivy to enable image scanning.',
      };
    }

    try {
      const { stdout } = await execAsync(
        `trivy image --format json --quiet "${image}"`,
        { timeout: 120000 },
      );
      const parsed = JSON.parse(stdout);
      const vulns: TrivyVulnerability[] = [];

      for (const result of parsed?.Results || []) {
        for (const v of result?.Vulnerabilities || []) {
          vulns.push({
            id: v.VulnerabilityID,
            severity: v.Severity,
            pkg: v.PkgName,
            version: v.InstalledVersion,
            fixedVersion: v.FixedVersion,
            title: v.Title || v.VulnerabilityID,
          });
        }
      }

      const summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
      for (const v of vulns) {
        const key = v.severity.toLowerCase() as keyof typeof summary;
        if (key in summary) summary[key]++;
        else summary.unknown++;
      }

      return { image, scannedAt: new Date(), available: true, vulnerabilities: vulns, summary };
    } catch (err: any) {
      this.logger.error(`Trivy scan failed for ${image}: ${err.message}`);
      return { image, scannedAt: new Date(), available: true, error: err.message };
    }
  }
}
