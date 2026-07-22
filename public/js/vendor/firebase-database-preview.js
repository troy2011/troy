// Minimal RTDB surface for the standalone Tarot Kingdom preview.
// The production app continues to use the real Firebase module from index.html.
export function ref(database, path = '') {
    return { database, path: String(path || '') };
}

export async function get() {
    return {
        exists: () => false,
        val: () => null
    };
}

export async function set() {}

export async function update() {}

export async function runTransaction(reference, update) {
    const value = update?.(null);
    return {
        committed: value !== undefined,
        snapshot: {
            exists: () => value != null,
            val: () => value ?? null,
            ref: reference
        }
    };
}

export async function remove() {}

export async function push(reference, value) {
    return { key: `preview-${Date.now()}`, reference, value };
}

export function onValue(_reference, callback) {
    queueMicrotask(() => callback?.({ exists: () => false, val: () => null }));
    return () => {};
}

export function onChildAdded() {
    return () => {};
}

export function onDisconnect() {
    return {
        remove: async () => {},
        set: async () => {}
    };
}

export function serverTimestamp() {
    return Date.now();
}
