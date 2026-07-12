# Roles

This doc details the roles that a character can have and the responsibilities of each role.
At time of writing 11/07/2026, this is not fully in place. This doc is outlining the proposal
and I'll work towards tailoring each character to better fit the assigned role over time.

The reason for the more specialised roles is that my current implementation is quite gernealised and there
is a lot of crossover in responsibilities. For example, the crafter will attempt to craft potions if they don't have any in
the bank. This sounds good but is slow when trying to level up. The higher alchemy character will have better
cooldowns so they should be crafting potions.

## Role definitions

### Crafter

Weapon, gear and jewelry crafting

### Healer

Primary job is keeping potions topped up in the bank
Also ensures fish is stocked up in the bank. High fishing is nice to collect algae for
potions.

### Labourer x2

High mining and wooductting skill

### Fisherman

Keeping fish stocked up and cooking raw ingredients in the bank

## Tasks

Characters will still need to complete tasks to get task coins. If they get a task to retrieve an item that is outside
their responsibilities, they can post a request to the wishlist and another character will fulfill it.
While they are waiting for the other character to fulfill it, they can move on to some other task. They
should check in periodically to see if the request has been fulfilled.
This should not get out of hand with a character requesting too many items, because a character can only
have 1 active task at a time.

## Things that can be implemented now

1. [ ] Idle jobs can be split into IdleHealerObjective, etc, allowing for more specialised idle jobs and decluttering
       the current IdleObjective class.
2. [ ] Characters can request items via the wishlist table.
3. [ ] Characters should check the wishlist table to see what things are being requested and what they can fulfill. This
       would be based on the skill required and their role. Only certain roles should fulfill certain requests (i.e. mining
       resources fulfilled by a labourer, potions by the healer, etc)

## Requirements before this can happen

1. Jobs should be able to be put on hold. If a character requests 50 iron bars, they shouldn't wait around for them. The
   character should put that job into a backlog and move on to something else. Periodically the character should be able to
   check if the requested item has been fulfilled and if yes, resume the job. If no, carry on checking more backlog jobs or
   pick up some other idle task.
