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
for (let match = 0; match < 60; match++) {
  let g = newGame(makeConfig({ players: 2 + (match % 3), targetRounds: 3,
    proVariant: match % 2 === 0, proDescendingStep: match % 4 < 2 ? 'any' : 'one',
    roundEndMode: match % 5 === 0 ? 'call' : 'auto',
    shuffleOnRecycle: match % 3 !== 0, autoRefillRow: match % 7 !== 0 }), match);
  let n = 0; let lastRound = 1; let roundStart = 0;
  while (g.phase !== 'matchEnded' && n < 30000) {
    n++;
    if (g.round !== lastRound) { lastRound = g.round; roundStart = n; }
    if (g.phase === 'playing' && n - roundStart > 1500) {
      stale++; const rT = apply(g, { type: 'endRoundStalemate' }); if (rT.ok) { g = rT.state; roundStart = n; } continue;
    }
    if (g.phase === 'roundEnded') { const r = apply(g, { type: 'startNextRound', seed: n * 31 + match }); g = r.ok ? r.state : g; continue; }
    // Bots reihum: Center-Zug wenn möglich, sonst Hand flippen; harte Blockade -> Host beendet
    for (let p = 0; p < g.config.players; p++) {
      if (g.config.roundEndMode === 'call' && g.players[p].quick.length === 0) {
        const r = apply(g, { type: 'callStop', player: p }); if (r.ok) { g = r.state; }
      }
    }
    if (g.phase !== 'playing') continue;
    if (!g.config.autoRefillRow) {
      for (let p = 0; p < g.config.players; p++)
        g.players[p].row.forEach((st, slot) => {
          if (st.length === 0) { const r = apply(g, { type: 'refillRow', player: p, slot }); if (r.ok) g = r.state; }
        });
    }
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
console.log(`Matches beendet: ${ended}/60, Blockaden: ${stale}, Schritte p50/p95: ${steps[Math.floor(steps.length/2)]}/${steps[Math.floor(steps.length*0.95)]}`);
