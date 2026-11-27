import sys, time, lib, defs
names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(defs.PROPS)
for n in names:
    t0 = time.time(); lib.reset(); defs.PROPS[n](); obs = lib.finish_parts(); lib.bake(obs); tris = lib.export(n, obs)
    print('%-12s %5d triângulos  %.1fs' % (n, tris, time.time() - t0), flush=True)
