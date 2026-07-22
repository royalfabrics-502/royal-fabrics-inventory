const listeners = new Map();
const history = [];

export const CORE_EVENTS = {
  RECORD_CREATED: 'core.record.created',
  RECORD_UPDATED: 'core.record.updated',
  RECORD_DELETED: 'core.record.deleted',
  INVENTORY_CREATED: 'inventory.created',
  INVENTORY_UPDATED: 'inventory.updated',
  INVENTORY_DELETED: 'inventory.deleted',
};

export function subscribe(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

export function subscribeAll(handler) {
  return subscribe('*', handler);
}

export async function publishEvent(eventName, payload = {}, metadata = {}) {
  const event = {
    id: crypto.randomUUID(),
    name: eventName,
    payload,
    metadata,
    occurredAt: new Date().toISOString(),
  };

  history.push(event);
  const handlers = [
    ...(listeners.get(eventName) || []),
    ...(listeners.get('*') || []),
  ];

  await Promise.allSettled(handlers.map((handler) => handler(event)));
  return event;
}

export function getEventHistory() {
  return [...history];
}

export function clearEventHistory() {
  history.length = 0;
}
