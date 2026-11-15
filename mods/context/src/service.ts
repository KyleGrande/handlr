import { randomUUID } from 'node:crypto';
import { fail, keys, machineID, object, target, text } from './model.js';
import { agentLifetime, resolveSpace } from './identity.js';
import { Store } from './storage.js';

/** One protocol for native panels and CLI; no tracker or lifecycle side effects. */
export async function dispatch(value: unknown, store = new Store()): Promise<unknown> {
  const r = object(value);
  switch (r.op) {
    case 'open': {
      keys(r, ['op', 'space', 'agent', 'on']);
      if (r.on !== undefined && r.on !== null) text(r.on, 'machine connection', 128);
      const parent = await resolveSpace(text(r.space, 'Space ID', 256), r.on as string | null);
      const owner = r.agent === undefined ? parent : await store.agentForLifetime(await agentLifetime(parent, text(r.agent, 'selected agent', 256), r.on as string | null));
      return { record: await store.read(owner), parent };
    }
    case 'resolve-agent': {
      keys(r, ['op', 'space', 'agent', 'on']);
      if (r.on !== undefined && r.on !== null) text(r.on, 'machine connection', 128);
      const parent = await resolveSpace(text(r.space, 'Space ID', 256), r.on as string | null);
      const lifetime = await agentLifetime(parent, text(r.agent, 'selected agent', 256), r.on as string | null);
      return { target: await store.agentForLifetime(lifetime), inherited: parent };
    }
    case 'resolve': {
      keys(r, ['op', 'space', 'on']);
      if (r.on !== undefined && r.on !== null) text(r.on, 'machine connection', 128);
      return { target: await resolveSpace(r.space === undefined ? undefined : text(r.space, 'Space ID', 256), r.on as string | null) };
    }
    case 'read': {
      keys(r, ['op', 'target', 'inherited']);
      const owner = target(r.target);
      const parent = r.inherited === undefined ? undefined : target(r.inherited);
      if (parent && (owner.kind !== 'agent' || parent.kind !== 'space' || owner.machine !== parent.machine)) fail('invalid_input', 'Inheritance requires an agent and Space on the same machine.');
      return { record: await store.read(owner), inherited: parent ? await store.read(parent) : null };
    }
    case 'write': {
      keys(r, ['op', 'target', 'expected_revision', 'patch']);
      return { record: await store.write(target(r.target), r.expected_revision as number, r.patch) };
    }
    case 'new-agent': {
      keys(r, ['op', 'machine']);
      return { target: { kind: 'agent', machine: machineID(r.machine), id: randomUUID() } };
    }
    default: fail('invalid_input', 'Unknown operation.');
  }
}
