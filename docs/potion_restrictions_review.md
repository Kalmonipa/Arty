# Potion restrictions — review after live data

A set of changes landed on 23 Aug 2026 to cut health potion use in ordinary fights.
This is the baseline they were measured against and the procedure for deciding
whether to keep or revert them. **Delete this file once the decision is made.**

## What changed

| #   | Change                                                                                                                                       | Where                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | 300 restore potions in the bank are reserved for boss fights and are invisible to an ordinary fight. Counted across all tiers, not per tier. | `BossFightPotionReserve` in `constants.ts`, `Character.spareOutsideBossReserve` |
| 2   | `equipUtility` reads the bank through one `BankCache` snapshot instead of one request per potion tier                                        | `Character.equipUtility`                                                        |
| 3   | A fight winning ≥60% unaided is fought dry rather than buying potions to reach the simulator's 80% pass mark                                 | `DryFightWinRateFloor`, `FightObjective.decideOnHealthPotions`                  |
| 4   | A deliberately dry fight tolerates 6 consecutive losses instead of 3, and a loss does not retest the potion verdict                          | `DryFightMaxConsecutiveLosses`, `FightObjective.acceptedDryWinRate`             |
| 5   | The alchemist works toward 500 restore potions across all tiers, 100 per tier per pass, instead of crafting 100 per pass forever             | `RestorePotionStockTarget`, `IdleHealerObjective.topUpRestorePotionsInBank`     |
| 6   | The alchemist keeps 100 of each damage-boost and resistance potion, refilled below 50                                                        | `IdleHealerObjective.topUpFightPotionsInBank`                                   |

Related earlier work in the same area: the fight potion decision was rewritten so
potions are only equipped when they decide the fight, and boss fight participants
equip role potions in utility 2.

## Check the version first

The containers run code baked into the image at build time. If these changes have
not been rebuilt and pushed, every measurement below will show no change and the
honest conclusion is "not deployed yet", not "no benefit".

Each container logs its release as its first line on startup, so the question is
answerable directly. Read the most recent one:

```bash
ssh krustykrab 'cd ~/Docker/Arty/logs && zcat -f longleglarry/arty-*.log* \
  | grep -o "Arty v[0-9.]* starting" | tail -1'
```

The changes under review, and the version line itself, both landed on 23 Aug 2026
and ship together in the first tag cut after that date. So:

- **A version at or after that tag** — the changes are running, measure away.
- **An earlier version** — not deployed. Rebuild before drawing any conclusion.
- **`Arty dev starting`** — running from source rather than a tagged image.
- **Nothing at all** — the image predates the version line entirely, which also
  means it predates these changes.

Cross-check against what the daemon thinks it is pulling, which catches a stack
that was never restarted onto the new image:

```bash
ssh krustykrab 'docker ps --format "{{.Image}}\t{{.CreatedAt}}" | sort -u'
```

## Baseline — LongLegLarry, week 34 (19–23 Aug 2026)

| Measure                                                |                   Baseline | Direction wanted                   |
| ------------------------------------------------------ | -------------------------: | ---------------------------------- |
| Restore potions withdrawn from the bank                |                  **2,530** | down hard — under 500              |
| Failed potion lookups (`Can't find any …`)             |                 **18,820** | near zero, from change 2           |
| Bank-empty equip failures (`No potions found in bank`) |                 **10,269** | near zero                          |
| Fight checks needing potions                           | **12,042 of 13,434 (90%)** | down to roughly the `goblin` share |
| Fights run against the three sinks                     |                 **12,268** | **must hold steady**               |
| Objectives abandoned to consecutive losses             |                         ~0 | some rise is fine, a spike is not  |

Fleet-wide equip attempts for context: Larry 18,874, ZippyZoe 18,959,
BouncyBella 2,234, JumpyJimmy 0, TimidTom 0.

Simulated unaided win rates, which are what change 3 acts on:

| Monster        | Unaided (median) | With potions | Fight checks |
| -------------- | ---------------: | -----------: | -----------: |
| `cursed_tree`  |              70% |         100% |        6,624 |
| `goblin_guard` |              70% |         100% |        3,623 |
| `goblin`       |              10% |         100% |        2,021 |

Means were lower than medians — 64.9% on `cursed_tree`, 50.6% on `goblin_guard` —
so a slice of those fights sits below the 60% floor and will still buy potions.

Bank and fleet state when the changes landed: 16 `small_health_potion` and nothing
else restore-shaped, 0 `egg`, 1 `nettle_leaf`, 0 `sunflower`, 0 `maple_sap`. Every
character's utility slots were empty except ZippyZoe, carrying 50 `health_potion`.

## Measuring again

Run these against a full week of logs after the change has been live for one.
Substitute the week number.

```bash
# Potions actually consumed, and the failures around them
ssh krustykrab 'cd ~/Docker/Arty/logs && zcat -f longleglarry/arty-2026-W??.log* \
  | python3 -c "
import sys, re, json, collections
w = collections.Counter(); fail = collections.Counter()
for line in sys.stdin:
    try: m = json.loads(line)[\"message\"]
    except Exception: continue
    x = re.match(r\"Withdrew (\d+) ([a-z_]*health_potion) from the bank\", m)
    if x: w[x.group(2)] += int(x.group(1)); continue
    if m.startswith(\"No potions found in bank\"): fail[\"bank_empty\"] += 1
    elif \"Can't find any\" in m and \"Potion\" in m: fail[\"lookup_miss\"] += 1
    elif \"of the time unaided\" in m: fail[\"fought_dry\"] += 1
    elif \"fights in a row\" in m: fail[\"objective_abandoned\"] += 1
print(\"withdrawn:\", dict(w), \"total:\", sum(w.values()))
print(\"counters:\", dict(fail))
"'
```

```bash
# Fight volume by monster — the number that must NOT collapse
ssh krustykrab 'cd ~/Docker/Arty/logs && zcat -f longleglarry/arty-2026-W??.log* \
  | grep -oE "Simulating fight against [a-z_]+ with no utilities" \
  | sort | uniq -c | sort -rn | head'
```

```bash
# Current bank stock against the 500 target and the 300 reserve
T=$(grep -m1 "^API_TOKEN=" .env | cut -d= -f2- | tr -d "\"'")
for p in 1 2; do
  curl -s -H "Authorization: Bearer $T" \
    "https://api.artifactsmmo.com/my/bank/items?size=100&page=$p" \
    | python3 -c "
import json, sys
for i in json.load(sys.stdin)['data']: print(i['code'], i['quantity'])
"
done | python3 -c "
import sys
keys = ('health_potion','boost_potion','res_potion','elixir','egg',
        'sunflower','maple_sap','nettle_leaf','glowstem_leaf')
restore = 0
for line in sys.stdin:
    code, qty = line.split()
    if not any(k in code for k in keys): continue
    if code.endswith('health_potion'): restore += int(qty)
    print('%-32s %s' % (code, qty))
print('%-32s %d  (reserve 300, target 500)' % ('TOTAL restore', restore))
"
```

## Deciding

**Keep** if potions withdrawn fell sharply, failed lookups collapsed, and the
fight counts against `cursed_tree` and `goblin_guard` held roughly steady. That is
the intended outcome: the same fighting, far fewer potions.

**Revert change 3** (the dry floor) if losses climbed enough to abandon objectives
repeatedly, or if the extra attempts cost more time than the potions saved. The
fight cooldown is `turns × 2 × (1 − haste/100)`, so a lost fight is not free.
Raising `DryFightWinRateFloor` toward 70 is the softer alternative.

**Revert or lower change 1** (the reserve) if fight counts collapsed. That is the
signature of the reserve parking Larry rather than making him fight cheaper — a
fight needing potions it cannot see is skipped, not fought.

**Neither is at fault** if the alchemist is still not brewing. Both health potion
recipes need an `egg` and the bank had none; `greater_health_potion` also needs
`glowstem_leaf`. Check that before blaming the restrictions:

```bash
ssh krustykrab 'cd ~/Docker/Arty/logs && zcat -f zippyzoe/arty-2026-W??.log* \
  | grep -oE "Crafting [0-9]+ [a-z_]*potion" | sort | uniq -c | sort -rn'
```

## Known upstream blockers

These gate the alchemist regardless of the changes above.

| Ingredient    | Blocks                                   | Source                                                                                            |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `egg`         | `health_potion`, `greater_health_potion` | `chicken`, level 1, 1/12. The bank's 8 `golden_egg` are a different item and will not substitute. |
| `sunflower`   | all four boost potions                   | `sunflower_field`, alchemy 1 — Zoe can gather it herself                                          |
| `maple_sap`   | all four resistance potions              | `maple_tree`, woodcutting 40 — needs BouncyBella or JumpyJimmy                                    |
| `bat_wing`    | `enhanced_boost_potion`                  | `bat`, level 38, 1/12                                                                             |
| `milk_bucket` | `health_boost_potion`                    | `cow`, level 8, 1/12                                                                              |
