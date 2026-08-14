import { newGame, makeConfig, apply, anyVisibleCenterPlay, isHardStalemate, matchWinners } from '../src/engine.js';
import { GameState, Action, Source } from '../src/types.js';

function legalCenterActions(g: GameState, player: number): Action[] {
  const p = g.players[player];
  const srcs: Source[] = [
    ...p.row.map((st, slot) => st.length ? [{ kind: 'row', slot } as Source] : []).flat(),
    ...(p.quick[0] ? [{ kind: 'quick' } as Source] : []),
    ...(p.waste[0] ? [{ kind: 'waste' } as Source] : []),
  ];
  const acts: Action[] = [];
  for (const source of srcs) {
    const c = source.kind === 'row' ? p.row[source.slot][0]! : source.kind === 'quick' ? p.quick[0] : p.waste[0];
    if (c.value === 1) acts.push({ type: 'playToCenter', player, source, pile: 'new' });
    g.center.forEach((pl, i) => {
      if (pl.color === c.color && pl.height + 1 === c.value) acts.push({ type: 'playToCenter', player, source, pile: i });
    });
  }
  return acts;
}

let stale = 0, ended = 0, steps: number[] = [];
for (let match = 0; match < 200; match++) {
  let g = newGame(makeConfig({ players: 2 + (match % 3), targetRounds: 3 }), match);
  let n = 0;
  while (g.phase !== 'matchEnded' && n < 100000) {
    n++;
    if (g.phase === 'roundEnded') { const r = apply(g, { type: 'startNextRound', seed: n * 31 + match }); g = r.ok ? r.state : g; continue; }
    // Bots reihum: Center-Zug wenn möglich, sonst Hand flippen; harte Blockade -> Host beendet
    if (isHardStalemate(g)) { stale++; const r = apply(g, { type: 'endRoundStalemate' }); g = r.ok ? r.state : g; continue; }
    let played = false;
    for (let p = 0; p < g.config.players; p++) {
      const acts = legalCenterActions(g, p);
      if (acts.length) { const r = apply(g, acts[n % acts.length]); if (r.ok) { g = r.state; played = true; break; } }
    }
    if (!played) {
      const p = n % g.config.players;
      const r = apply(g, { type: 'flipHand', player: p });
      if (!r.ok) { // Hand+Ablage leer -> naechster
        const r2 = apply(g, { type: 'flipHand', player: (p + 1) % g.config.players });
        if (!r2.ok && isHardStalemate(g)) { const r3 = apply(g, { type: 'endRoundStalemate' }); g = r3.ok ? r3.state : g; }
        else if (r2.ok) g = r2.state;
      } else g = r.state;
    }
  }
  if (g.phase === 'matchEnded') { ended++; steps.push(n); }
}
steps.sort((a, b) => a - b);
console.log(`Matches beendet: ${ended}/200, Blockaden: ${stale}, Schritte p50/p95: ${steps[100]}/${steps[190]}`);
