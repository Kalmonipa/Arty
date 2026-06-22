# Navigation

With the addition of [Transitions](https://docs.artifactsmmo.com/concepts/maps_and_movement/#transition) we need to write 
some navigational logic. Before it was just a matter of using the move() function. Now it's a matter of moving to the
relevant transition point, calling the transition endpoint, then moving again to the target map (which may be another 
transition point).

My plan for this navigational logic is to build a map of zones on app startup, iterating through every map ID and creating
zones based on what maps are reachable from each map. A transition point marks an entry point into a new zone, connecting
the previous zone to the new zone UNLESS the location after transitioning has already been mapped and is already part of a zone.
Some zones will have multiple transition points, with the possibility that multiple of those transition points end up in the
same destination zone.

Once these zones are defined, the character should then be able to calculate a pathway from their current location to the 
destination.

## Zone definition

There are several types of access types and conditions for accessing maps, seen in the [docs here](https://docs.beta.artifactsmmo.com/concepts/maps_and_movement/#access-types--conditions), specifically:

| Type    | Description |
| -------- | ------- |
| standard  | Freely accessible.|
| blocked | Not walkable (void, obstacle, mountain, water, etc.). |
| conditional    | Requires all listed conditions to be satisfied. |
| restricted | Only accessible from other restricted maps. Restricted maps cannot communicate with normal maps. |

We can utilise these access types to define the zones.
Zones will be surrounded by one of more of the following:
- maps with `access.type: blocked`, such as the following
```
{
  "map_id": 1099,
  "name": "Sea",
  "skin": "forest_coastline11",
  "x": 4,
  "y": 16,
  "layer": "overworld",
  "access": {
    "type": "blocked",
    "conditions": []
  },
  "interactions": {}
}
```
- maps with `access.type: restricted`, such as the following
```
{
  "map_id": 715,
  "name": "Enchanted Forest",
  "skin": "enchantedforest_5",
  "x": -5,
  "y": 9,
  "layer": "overworld",
  "access": {
    "type": "restricted",
    "conditions": []
  },
  "interactions": {
    "content": {
      "type": "resource",
      "code": "enchanted_mushroom"
    }
  }
}
```
- no map at all. 

## Transition Conditions

Some transition points require a gold cost or the character must have an item to access them. These conditions can be found in the 
[docs here](https://docs.beta.artifactsmmo.com/concepts/maps_and_movement/#maps-condition-operators).

| Operator | Meaning | Consumed? | Notes |
| -------- | ------- | -------- | ------- |
has_item | You must possess (inventory or equipped) the specified item code | No | |
cost | You must pay an item or gold | Yes | code = item (or gold), value = quantity. |
achievement_unlocked | Specific achievement must be completed | N/A | code = achievement identifier. |

This is an example of a transition point that requires the character is holding a `lich_tomb_key` item before they can move to 
this map
```
{
  "map_id": 655,
  "name": "Graveyard",
  "skin": "forest_skeleton5",
  "x": 9,
  "y": 7,
  "layer": "overworld",
  "access": {
    "type": "standard",
    "conditions": []
  },
  "interactions": {
    "content": {
      "type": "resource",
      "code": "dead_tree"
    },
    "transition": {
      "map_id": 656,
      "x": 9,
      "y": 7,
      "layer": "underground",
      "conditions": [
        {
          "code": "lich_tomb_key",
          "operator": "cost",
          "value": 1
        }
      ]
    }
  }
}
```

## Pathfinding

Here is where I'm a bit stuck on the best way to proceed. I believe the best way to navigate from point A to point B is just iterating
through the transition points of my current zone (zone 1), checking if the destination is in that zone (zone 2), if yes then 
execute that pathway. If not, check the transition points of zone 2, and check if destination is in zone 3, etc etc until finding 
my destination.
If any zone does not any further transition points and does not contain my destination then we can disregard that zone as a 
candidate in the pathway, and backtrack until we find an unexplored transition point.
