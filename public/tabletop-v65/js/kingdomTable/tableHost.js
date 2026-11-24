// The HTML entry describes the host. Neither query strings nor room identifiers
// can turn a local entry into an online client or change server authorization.
export function resolveTableHost(entry, adapter) {
    if ((entry !== 'troy' && entry !== 'sites') || adapter?.kind !== entry) {
        throw new Error('Mismatched tabletop host entry.');
    }
    if (!adapter.online || ['send', 'sendAction', 'returnToLobby', 'waitForCpuPresentation']
        .some(method => typeof adapter[method] !== 'function')) {
        throw new Error('Incomplete tabletop host adapter.');
    }
    return adapter;
}
