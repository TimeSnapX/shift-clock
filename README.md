# Shift Clock
Mobile-first PWA: shift timer with unpaid breaks, live gross by OT tier, NHVR standard-hours fatigue helper (not a legal work diary), Mon–Sun week pay estimate, bedtime countdown, localStorage history with JSON/CSV export.
Live: https://timesnapx.github.io/shift-clock/
Tests: `node --test test/` (pay maths) and `node test/e2e.mjs` (headless mobile).
Tax is an **estimate** from ATO Schedule 1 (NAT 1004) weekly Scale 2 coefficients. Fatigue rules: NHVR Standard Hours, solo drivers.
