import {
  preferLowestNode,
  selectResourceNode,
} from '../../src/core/resourceNodeSelection.js';
import { Character } from '../../src/character/character.js';
import { GatheringSkill, ResourceSchema } from '../../src/types/types.js';
import { Role } from '../../src/types/CharacterData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const node = (
  code: string,
  level: number,
  skill: GatheringSkill,
  drop: string,
): ResourceSchema => ({
  name: code,
  code,
  skill,
  level,
  drops: [{ code: drop, rate: 10, min_quantity: 1, max_quantity: 1 }],
});

// algae drops at rate 10 from every fishing spot, sap from every tree, so node
// level only ever costs extra cooldown
const algaeNodes: ResourceSchema[] = [
  node('gudgeon_spot', 1, 'fishing', 'algae'),
  node('shrimp_spot', 10, 'fishing', 'algae'),
  node('trout_spot', 20, 'fishing', 'algae'),
  node('bass_spot', 30, 'fishing', 'algae'),
  node('salmon_spot', 40, 'fishing', 'algae'),
];

const sapNodes: ResourceSchema[] = [
  node('ash_tree', 1, 'woodcutting', 'sap'),
  node('spruce_tree', 10, 'woodcutting', 'sap'),
  node('birch_tree', 20, 'woodcutting', 'sap'),
  node('dead_tree', 30, 'woodcutting', 'sap'),
];

type CharacterOverrides = {
  role?: Role;
  fishingLevel?: number;
  woodcuttingLevel?: number;
  highestWeaponcraftingLevel?: number;
};

const makeCharacter = ({
  role = 'healer',
  fishingLevel = 1,
  woodcuttingLevel = 1,
  highestWeaponcraftingLevel = 24,
}: CharacterOverrides = {}): Character => {
  const character = new Character({
    ...mockCharacterData,
    name: 'ZippyZoe',
    fishing_level: fishingLevel,
    woodcutting_level: woodcuttingLevel,
  });
  character.role = role;
  character.highestWeaponcraftingLevel = highestWeaponcraftingLevel;
  return character;
};

describe('preferLowestNode', () => {
  it('is true for the healer on algae once fishing outruns fleet weaponcrafting', () => {
    const character = makeCharacter({
      fishingLevel: 43,
      highestWeaponcraftingLevel: 24,
    });

    expect(preferLowestNode(character, 'algae', 'fishing')).toBe(true);
  });

  it('is false while fishing is still behind fleet weaponcrafting', () => {
    const character = makeCharacter({
      fishingLevel: 20,
      highestWeaponcraftingLevel: 24,
    });

    expect(preferLowestNode(character, 'algae', 'fishing')).toBe(false);
  });

  it('is false when the levels are equal so the skill keeps training', () => {
    const character = makeCharacter({
      fishingLevel: 24,
      highestWeaponcraftingLevel: 24,
    });

    expect(preferLowestNode(character, 'algae', 'fishing')).toBe(false);
  });

  it('is false for a primary drop that only one node yields', () => {
    const character = makeCharacter({
      fishingLevel: 43,
      highestWeaponcraftingLevel: 24,
    });

    expect(preferLowestNode(character, 'gudgeon', 'fishing')).toBe(false);
  });

  it('is false for a role other than the healer', () => {
    const character = makeCharacter({
      role: 'fisherman',
      fishingLevel: 43,
      highestWeaponcraftingLevel: 24,
    });

    expect(preferLowestNode(character, 'algae', 'fishing')).toBe(false);
  });

  it('keeps training when the fleet level has not been loaded yet', () => {
    const character = makeCharacter({ fishingLevel: 43 });
    character.highestWeaponcraftingLevel = undefined;

    expect(preferLowestNode(character, 'algae', 'fishing')).toBe(false);
  });
});

describe('selectResourceNode', () => {
  it('picks the cheapest algae node when fishing outruns fleet weaponcrafting', () => {
    const character = makeCharacter({
      fishingLevel: 43,
      highestWeaponcraftingLevel: 24,
    });

    const { resource } = selectResourceNode(algaeNodes, character, 'algae');

    expect(resource?.code).toBe('gudgeon_spot');
  });

  it('picks the highest usable algae node while fishing is still behind', () => {
    const character = makeCharacter({
      fishingLevel: 20,
      highestWeaponcraftingLevel: 24,
    });

    const { resource } = selectResourceNode(algaeNodes, character, 'algae');

    expect(resource?.code).toBe('trout_spot');
  });

  it('picks the cheapest sap node when woodcutting outruns fleet weaponcrafting', () => {
    const character = makeCharacter({
      woodcuttingLevel: 31,
      highestWeaponcraftingLevel: 24,
    });

    const { resource } = selectResourceNode(sapNodes, character, 'sap');

    expect(resource?.code).toBe('ash_tree');
  });

  it('picks the highest usable sap node while woodcutting is still behind', () => {
    const character = makeCharacter({
      woodcuttingLevel: 22,
      highestWeaponcraftingLevel: 24,
    });

    const { resource } = selectResourceNode(sapNodes, character, 'sap');

    expect(resource?.code).toBe('birch_tree');
  });

  it('compares against the node skill rather than always fishing', () => {
    const character = makeCharacter({
      fishingLevel: 43,
      woodcuttingLevel: 22,
      highestWeaponcraftingLevel: 24,
    });

    const { resource } = selectResourceNode(sapNodes, character, 'sap');

    expect(resource?.code).toBe('birch_tree');
  });

  it('sorts by level rather than trusting the order the API returned', () => {
    const character = makeCharacter({
      fishingLevel: 43,
      highestWeaponcraftingLevel: 24,
    });
    const shuffled = [
      algaeNodes[2],
      algaeNodes[4],
      algaeNodes[0],
      algaeNodes[3],
      algaeNodes[1],
    ];

    const { resource } = selectResourceNode(shuffled, character, 'algae');

    expect(resource?.code).toBe('gudgeon_spot');
  });

  it('reports the lowest node for the wishlist when nothing is usable', () => {
    const character = makeCharacter({
      woodcuttingLevel: 0,
      highestWeaponcraftingLevel: 24,
    });

    const selection = selectResourceNode(sapNodes, character, 'sap');

    expect(selection.resource).toBeUndefined();
    expect(selection.skillNeeded).toBe('woodcutting');
    expect(selection.levelNeeded).toBe(1);
  });

  it('returns an empty selection when there are no nodes at all', () => {
    const character = makeCharacter();

    expect(selectResourceNode([], character, 'algae')).toEqual({});
  });
});
