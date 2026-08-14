# Host-advantage simulation: arrival-order vs reaction-time arbitration.
# Result (20k trials): arrival 80-85% fair, reaction-time 99.7% fair at ~90ms
# added resolution latency. No clock sync needed: only local deltas compared.
import numpy as np
rng = np.random.default_rng(3)

def trial(mode, n=4):
    lat = np.array([0.0] + list(rng.uniform(0.015, 0.040, n-1)))  # host = 0
    jit = lambda: rng.normal(0, 0.008, n).clip(-0.012, 0.012)
    t_render = lat + jit()                       # when each player SEES the event
    reaction = rng.normal(0.4, 0.1, n)           # true human reaction
    t_tap = t_render + reaction
    t_arrive = t_tap + lat + jit()               # intent back at host
    fastest = int(np.argmin(reaction))
    if mode == 'arrival':
        return int(np.argmin(t_arrive)) == fastest
    window = t_arrive.min() + 0.080
    cands = [i for i in range(n) if t_arrive[i] <= window]
    return min(cands, key=lambda i: reaction[i]) == fastest

for n in (2, 4):
    for mode in ('arrival', 'reaction'):
        fair = np.mean([trial(mode, n) for _ in range(20000)])
        print(f"n={n} {mode:>8}: fair={fair*100:5.1f}%")
