/**
 * Sockets are only added to this room once they have authenticated. Every
 * broadcast must target it — a plain io.emit() reaches sockets that merely
 * opened a connection and never sent JOIN.
 */
export const AUTHED_ROOM = "authed";
