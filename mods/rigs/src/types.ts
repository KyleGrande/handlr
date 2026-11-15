export type Binding = string | { endpoint?: string; external?: string; origin?: boolean; path?: string; secret_env?: string; secret_file?: string; probe?: {kind?: 'http' | 'tcp'; path?: string; timeout?: number} };
export interface EndpointSpec { protocol?: 'http' | 'https' | 'tcp'; port?: number; range?: [number, number] }
export interface Endpoint { host: string; port: number; protocol: string; url: string }
export interface Probe { endpoint: string; kind?: 'http' | 'tcp'; path?: string; timeout?: number }
export interface Service { repo: string; directory?: string; argv: string[]; env?: Record<string, Binding>; endpoints?: Record<string, EndpointSpec>; depends_on?: string[]; readiness?: Probe; data_scope?: string }
export interface SetupReview { approved: boolean; questions: string[]; decisions: Record<string,string>; evidence: {file:string; topic:string}[] }
export interface ExternalCheck { key: string; url: string; kind: 'http' | 'tcp'; timeout: number }
export interface RigConnection {
  consumer: {rig: string; name: string; service: string; binding: string};
  provider: {rig: string; name: string; service: string; endpoint: string};
  url: string;
  state: 'live' | 'unavailable' | 'unknown';
}
export type ProcessPlatform = 'win32' | 'darwin' | 'linux';
export interface ObservedApp { repo: string; process_name: string; executable?: string; platform?: ProcessPlatform; machine?: string; build_status_file?: {path: string; max_age_seconds?: number}; development?: {check: string[]; rebuild?: string[]; relaunch?: string[]} }
export interface ResolvedObservedApp extends ObservedApp { platform: ProcessPlatform; cwd?: string }
export interface ObservedProcess { pid: number; started_at: string; name: string; executable?: string }
export interface BuildStatus { state: 'current' | 'attention' | 'unknown'; label: string; reason: string }
export interface AppObservation extends ResolvedObservedApp { id: string; ownership: 'external'; state: 'running' | 'stopped' | 'unknown'; observed_at: string; matches: ObservedProcess[]; error?: string; build_status?: BuildStatus }
export interface Profile { version: 1; repos: string[]; services: Record<string, Service>; observed_apps?: Record<string, ObservedApp>; setup?: SetupReview }
export interface Checkout { root: string; repository: string; branch: string; unborn?: boolean }
export interface ResolvedService { id: string; repo: string; cwd: string; argv: string[]; env: Record<string, string>; secrets: Record<string, Binding>; endpoints: Record<string, Endpoint>; depends_on: string[]; readiness?: Probe; data_scope: string; fingerprint: string; external_checks?: ExternalCheck[]; external_bindings?: {key:string;url:string}[] }
export interface Plan { id: string; name: string; checkouts: Record<string, Checkout>; services: Record<string, ResolvedService>; observed_apps?: Record<string, ResolvedObservedApp>; order: string[]; endpoints: Record<string, Endpoint>; assignments: string; setup?: SetupReview; review: {fingerprint: string; approved: boolean} }
export interface Launch { id: string; operation: string; service: string; fingerprint: string; labels: Record<string, string>; terminal?: string; state: 'intent' | 'running' | 'exited' | 'unknown'; created: string; error?: string; excerpt?: string }
export interface Rig { id: string; name: string; profile: string; checkouts: Record<string, string>; ports: Record<string, number>; launches: Record<string, Launch>; checkout_bindings?: Record<string,Checkout>; allocation?: Plan; claimed: boolean; error?: string; approval?: {fingerprint: string; decisions: Record<string,string>} }
export interface Registry { version: 1; rigs: Record<string, Rig>; profiles?: string[] }
export interface Terminal { address: string; labels: Record<string, string>; state: string; reason?: string; parent?: string; exit_code?: number; argv?: string[]; created_ms: number }
export class RigError extends Error {}
export function requireValue(value: unknown, message: string): asserts value { if (!value) throw new RigError(message); }
export const now = () => new Date().toISOString();
