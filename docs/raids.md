# Raids

Raid docs: https://docs.artifactsmmo.com/concepts/raids/

### Procedure for the characters

Raids builds on boss fights with slightly different win conditions. To win a raid fight, the characters just need
to survive 100 turns. They do not need to kill the mob.

The raid will use the same `boss_fights` and `boss_fight_participants` tables.

- `boss_fight_participants` has the `reason` column to differentiate between a boss and a raid
- `boss_fights` doesn't have any column that could be used to differentiate between the two types. It should get
  modified to have a `fight_type` column or something similar.

The raid will use the same flow as boss fights:
A leader gets prompted, either manually via the API or automatically based on the characters decision, and recruits
2 participants to join them in the raid. At time of writing boss fights are only manually triggered but that might
change as I'm writing the code for raids.
The leader registers a fight in the DB. Characters are already checking to see if they've been recruited for a boss
fight so nothing should need to change there.
When they discover a fight they're involved in, they gear up and meet at the map. Once ready, they mark themselves
ready and the leader starts the fight.

### Schedule

Raids run on a schedule which can be retrieved with GET /raids
https://docs.artifactsmmo.com/concepts/raids/#retrieve-raids

### Rewards

The more damage you do to the raid boss, the more rewards you get
https://www.artifactsmmo.com/encyclopedia/raids/enchanted_fairy
