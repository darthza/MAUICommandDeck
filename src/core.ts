export type Platform = 'ios' | 'android' | 'maccatalyst';

export interface DeviceTarget {
  id: string;
  label: string;
  detail: string;
  platform: Platform;
}

export interface RunArguments {
  action: 'build' | 'clean';
  projectPath: string;
  configuration: string;
  framework?: string;
  device?: DeviceTarget;
}

export function isMauiProject(projectFile: string): boolean {
  return /<UseMaui>\s*true\s*<\/UseMaui>/i.test(projectFile);
}

export function targetFrameworks(projectFile: string): string[] {
  const frameworks = [...projectFile.matchAll(/<TargetFrameworks?\b[^>]*>\s*([^<]+)\s*<\/TargetFrameworks?>/gi)]
    .flatMap(match => match[1].split(';').map(value => value.trim()))
    .filter(value => value && !value.includes('$('));
  return [...new Set(frameworks)];
}

export function frameworkForPlatform(frameworks: string[], platform: Platform): string | undefined {
  const marker = platform === 'maccatalyst' ? 'maccatalyst' : platform;
  return frameworks.find(value => value.toLowerCase().includes(marker));
}

export function parseSimctlDevices(json: string): DeviceTarget[] {
  const parsed = JSON.parse(json) as {
    devices?: Record<string, Array<{ udid: string; name: string }>>;
  };
  const devices: DeviceTarget[] = [];
  for (const [runtime, entries] of Object.entries(parsed.devices ?? {})) {
    if (!runtime.includes('iOS')) continue;
    for (const entry of entries) {
      devices.push({
        id: entry.udid,
        label: entry.name,
        detail: runtime.split('.').pop() ?? runtime,
        platform: 'ios'
      });
    }
  }
  return devices;
}

export function parseAdbDevices(output: string): DeviceTarget[] {
  const devices: DeviceTarget[] = [];
  for (const line of output.split(/\r?\n/).slice(1)) {
    const match = line.match(/^(\S+)\s+device\b(.*)$/);
    if (!match) continue;
    const model = /model:(\S+)/.exec(match[2]);
    devices.push({
      id: match[1],
      label: model ? model[1].replaceAll('_', ' ') : match[1],
      detail: match[1],
      platform: 'android'
    });
  }
  return devices;
}

export function dotnetArguments(options: RunArguments): string[] {
  const args = [options.action, options.projectPath, '-c', options.configuration];
  if (options.framework) args.push('-f', options.framework);
  if (options.device?.platform === 'ios') {
    args.push(`-p:_DeviceName=:v2:udid=${options.device.id}`);
  }
  if (options.device?.platform === 'android') {
    args.push(`-p:AdbTarget=-s ${options.device.id}`);
  }
  return args;
}
