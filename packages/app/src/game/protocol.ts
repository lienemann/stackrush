import type { Action, Config, GameState, Rejection } from '@stackrush/core';

/**
 * Wire protocol between host and clients (over any Transport, JSON frames).
 * The host device's own UI runs a regular ClientSession over a loopback
 * transport — local seats take the identical path (docs/ARCHITECTURE.md).
 */

export interface LobbyPlayer {
  name: string;
  /** stable id of the owning device ('host' for the host device, 'bot' for AI) */
  deviceKey: string;
  connected: boolean;
  /** difficulty 1..5 if this seat is a computer player, else undefined */
  bot?: number;
}

export interface LobbyState {
  roomCode: string | null;
  players: LobbyPlayer[]; // player index = array position
  config: Config;
  started: boolean;
}

export type ClientMsg =
  | { t: 'hello'; deviceKey: string; seats: string[] } // seat names claimed by this device
  | { t: 'intent'; id: string; action: Action; stateVersion: number; reactionMs: number }
  | { t: 'pong'; id: number };

export type HostMsg =
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'state'; version: number; state: GameState; acceptedIds: string[] }
  | { t: 'reject'; id: string; reason: Rejection }
  | { t: 'ping'; id: number }
  /** join refused: the game already runs, or too few free seats (free = count) */
  | { t: 'full'; reason: 'started' | 'seats'; free?: number };

export type Msg = ClientMsg | HostMsg;

/** unambiguous room-code alphabet (no 0/O, 1/I) */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(len = 5): string {
  let out = '';
  const rnd = new Uint32Array(len);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[rnd[i] % CODE_ALPHABET.length];
  return out;
}
