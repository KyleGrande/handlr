import type { RigConnection } from './types.js';

export interface ConnectionRig {
  id: string; name: string; claimed: boolean;
  services: Record<string, {
    state: string;
    endpoints: Record<string,{url:string}>;
    external_bindings: {key:string;url:string}[];
    external_dependencies: {key:string;readiness:string}[];
  }>;
}

function authority(value: string) {
  try {
    const url = new URL(value);
    if (!['http:','https:','tcp:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
    const port = url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '');
    return `${url.protocol}//${host}:${port}`;
  } catch { return ''; }
}

/** Match declared external bindings to uniquely reserved endpoints; never infer ownership from a URL alone. */
export function rigConnections(rigs: ConnectionRig[]): RigConnection[] {
  const providers = rigs.filter(rig => rig.claimed).flatMap(rig => Object.entries(rig.services).flatMap(([service,spec]) =>
    Object.entries(spec.endpoints).map(([endpoint,value]) => ({rig,service,endpoint,state:spec.state,authority:authority(value.url)}))));
  const connections: RigConnection[] = [];
  for (const rig of rigs) for (const [service,spec] of Object.entries(rig.services)) {
    for (const binding of spec.external_bindings) {
      const target = authority(binding.url);
      if (!target) continue;
      const matches = providers.filter(provider => provider.rig.id !== rig.id && provider.authority === target);
      if (matches.length !== 1) continue;
      const provider = matches[0], observation = spec.external_dependencies.find(item => item.key === binding.key);
      const unknown = spec.state === 'unknown' || provider.state === 'unknown' || observation?.readiness === 'unavailable';
      const live = spec.state === 'running' && provider.state === 'running' && observation?.readiness !== 'failed';
      connections.push({
        consumer:{rig:rig.id,name:rig.name,service,binding:binding.key},
        provider:{rig:provider.rig.id,name:provider.rig.name,service:provider.service,endpoint:provider.endpoint},
        url:binding.url,state:unknown ? 'unknown' : live ? 'live' : 'unavailable',
      });
    }
  }
  return connections;
}
