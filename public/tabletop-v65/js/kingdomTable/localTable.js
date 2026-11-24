// Local TROY tabletop has no connected transport or account; shared renderer never receives a room view.
export const kind = 'troy';
export const online = { get view() { return null; }, paused: false, busy: false };
export const send = () => {};
export const sendAction = () => {};
export const returnToLobby = () => {};
export const waitForCpuPresentation = () => {};
