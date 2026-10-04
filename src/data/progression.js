// Quests, achievements and level unlocks.

export const QUESTS = [
  { id: 'q_feed', title: 'Feed Your Fish', desc: 'Tap Feed and watch your keeper sprinkle food.', event: 'fish:fed', count: 1, reward: { coins: 150, xp: 40 } },
  { id: 'q_name', title: 'Name a Fish', desc: 'Select a fish and give it a name.', event: 'fish:renamed', count: 1, reward: { coins: 100, xp: 30 } },
  { id: 'q_clean', title: 'Clean Aquarium Glass', desc: 'Open Care → Wipe Glass and scrub away an algae patch.', event: 'clean:patch', count: 1, reward: { coins: 150, xp: 40 } },
  { id: 'q_plant', title: 'Buy Your First Plant', desc: 'Buy a plant from the shop and place it in the tank.', event: 'plant:placed', count: 1, reward: { coins: 200, xp: 50 }, requires: 'q_feed' },
  { id: 'q_buyfish', title: 'Welcome a New Fish', desc: 'Buy any fish from the shop.', event: 'fish:bought', count: 1, reward: { coins: 250, pearls: 5, xp: 60 }, requires: 'q_plant' },
  { id: 'q_driftwood', title: 'Add Driftwood', desc: 'Place a piece of driftwood in Decorate mode.', event: 'decor:placed', filter: { cat: 'driftwood' }, count: 1, reward: { coins: 200, xp: 60 }, requires: 'q_buyfish' },
  { id: 'q_cat', title: 'Say Hi to Miso', desc: 'Tap the cat to give it a scratch.', event: 'cat:petted', count: 1, reward: { coins: 80, xp: 20 }, requires: 'q_name' },
  { id: 'q_water', title: 'Reach Excellent Water', desc: 'Keep water quality EXCELLENT (try a water change).', event: 'water:excellent', count: 1, reward: { coins: 300, xp: 80 }, requires: 'q_clean' },
  { id: 'q_photo', title: 'Photograph Your Favorite Fish', desc: 'Favorite a fish, then take a photo in Photo mode.', event: 'photo:taken', filter: { favorite: true }, count: 1, reward: { coins: 200, pearls: 5, xp: 60 }, requires: 'q_driftwood' },
  { id: 'q_feed10', title: 'Regular Meals', desc: 'Feed your fish 8 times.', event: 'fish:fed', count: 8, reward: { coins: 400, xp: 100 }, requires: 'q_water' },
  { id: 'q_breed', title: 'Breed Two Fish', desc: 'Pair two compatible adults from the fish panel.', event: 'fish:bred', count: 1, reward: { coins: 500, pearls: 10, xp: 150 }, requires: 'q_photo' },
  { id: 'q_raise', title: 'Raise Your First Baby', desc: 'Help a fry grow into a juvenile.', event: 'fish:grew', filter: { stage: 'JUVENILE' }, count: 1, reward: { coins: 600, pearls: 10, xp: 200 }, requires: 'q_breed' },
  { id: 'q_trim', title: 'Gardener', desc: 'Trim overgrown plants 3 times.', event: 'plant:trimmed', count: 3, reward: { coins: 300, xp: 90 }, requires: 'q_feed10' },
  { id: 'q_style', title: 'Make It Yours', desc: 'Customize your keeper or your room.', event: 'customize', count: 1, reward: { coins: 200, xp: 60 }, requires: 'q_trim' },
  { id: 'q_trick', title: 'Teach a Trick', desc: 'Train any fish until it learns a trick.', event: 'trick:learned', count: 1, reward: { coins: 500, pearls: 8, xp: 160 }, requires: 'q_raise' },
  { id: 'q_mutation', title: 'Discover a Mutation', desc: 'Breed until a mutation appears.', event: 'mutation', count: 1, reward: { coins: 800, pearls: 15, xp: 250 }, requires: 'q_raise' },
  { id: 'q_beauty', title: 'Showpiece', desc: 'Reach an Aquarium Beauty score of 75.', event: 'beauty', filter: { min: 75 }, count: 1, reward: { coins: 700, pearls: 10, xp: 200 }, requires: 'q_style' },
  { id: 'q_tank2', title: 'Purchase a Second Aquarium', desc: 'Buy another aquarium in the Store (Tank tab).', event: 'tank:bought', count: 1, reward: { coins: 1000, pearls: 20, xp: 300 }, requires: 'q_beauty' },
  { id: 'q_upgrade', title: 'Think Bigger', desc: 'Upgrade an aquarium to a larger size.', event: 'tank:upgraded', count: 1, reward: { coins: 1500, pearls: 20, xp: 400 }, requires: 'q_tank2' },
  { id: 'q_marine', title: 'Into the Reef', desc: 'Own a marine fish.', event: 'fish:bought', filter: { env: 'marine' }, count: 1, reward: { coins: 2000, pearls: 30, xp: 500 }, requires: 'q_upgrade' },
];

export const ACHIEVEMENTS = [
  { id: 'first_splash', name: 'FIRST SPLASH', desc: 'Welcome your first new fish.', stat: 'fishBought', goal: 1, reward: { pearls: 5 } },
  { id: 'feeding_time', name: 'FEEDING TIME', desc: 'Feed your fish 25 times.', stat: 'feeds', goal: 25, reward: { pearls: 10 } },
  { id: 'aquascaper', name: 'AQUASCAPER', desc: 'Place 12 decorations or plants.', stat: 'placed', goal: 12, reward: { pearls: 10 } },
  { id: 'fish_friend', name: 'FISH FRIEND', desc: 'Reach maximum bond with a fish.', stat: 'maxBond', goal: 1, reward: { pearls: 15 } },
  { id: 'new_generation', name: 'NEW GENERATION', desc: 'Hatch your first baby fish.', stat: 'hatched', goal: 1, reward: { pearls: 10 } },
  { id: 'rare_beauty', name: 'RARE BEAUTY', desc: 'Own a fish of RARE rarity or higher.', stat: 'rareOwned', goal: 1, reward: { pearls: 10 } },
  { id: 'master_breeder', name: 'MASTER BREEDER', desc: 'Breed fish 10 times.', stat: 'breeds', goal: 10, reward: { pearls: 25 } },
  { id: 'gardener', name: 'UNDERWATER GARDENER', desc: 'Have 24 plants growing at once.', stat: 'plantsMax', goal: 24, reward: { pearls: 15 } },
  { id: 'hundred', name: '100 FISH RAISED', desc: 'Raise 100 fish to adulthood.', stat: 'raised', goal: 100, reward: { pearls: 100 } },
  { id: 'clear', name: 'CRYSTAL CLEAR', desc: 'Clean 20 algae patches.', stat: 'patches', goal: 20, reward: { pearls: 10 } },
  { id: 'collector', name: 'COLLECTOR', desc: 'Discover 10 species.', stat: 'discovered', goal: 10, reward: { pearls: 20 } },
  { id: 'shutterbug', name: 'SHUTTERBUG', desc: 'Take 10 photos.', stat: 'photos', goal: 10, reward: { pearls: 10 } },
  { id: 'mutant', name: 'MUTATION HUNTER', desc: 'Discover 3 mutations.', stat: 'mutations', goal: 3, reward: { pearls: 20 } },
  { id: 'trainer', name: 'TRAINER', desc: 'Teach 3 tricks.', stat: 'tricks', goal: 3, reward: { pearls: 15 } },
  { id: 'cat', name: 'CAT WHISPERER', desc: 'Pet the cat 10 times.', stat: 'catPets', goal: 10, reward: { pearls: 5 } },
  { id: 'marine', name: 'REEF KEEPER', desc: 'Own a marine fish.', stat: 'marineOwned', goal: 1, reward: { pearls: 20 } },
  { id: 'bigtank', name: 'GO BIG', desc: 'Own a 180 gallon aquarium or larger.', stat: 'bigTank', goal: 1, reward: { pearls: 20 } },
  { id: 'designer', name: 'INTERIOR DESIGNER', desc: 'Buy 5 room items.', stat: 'roomItems', goal: 5, reward: { pearls: 10 } },
];

export const xpForLevel = (lvl) => Math.round(120 * Math.pow(lvl, 1.6));

export const FEATURE_UNLOCKS = {
  breeding: 3,
  nursery: 3,
  training: 4,
  marine: 7,
  roomCustom: 2,
};

// Rotating "live" events shown in the Events panel. Picked by week number.
export const LIVE_EVENTS = [
  { id: 'bloom', name: 'Bloom Festival', desc: 'Trim plants 5 times this week.', event: 'plant:trimmed', count: 5, reward: { coins: 800, pearls: 15 } },
  { id: 'feast', name: 'Feast Week', desc: 'Feed your fish 15 times this week.', event: 'fish:fed', count: 15, reward: { coins: 700, pearls: 12 } },
  { id: 'shutter', name: 'Photo Week', desc: 'Take 5 aquarium photos this week.', event: 'photo:taken', count: 5, reward: { coins: 600, pearls: 15 } },
  { id: 'sparkle', name: 'Sparkle Clean', desc: 'Clean 8 algae patches this week.', event: 'clean:patch', count: 8, reward: { coins: 700, pearls: 12 } },
];
