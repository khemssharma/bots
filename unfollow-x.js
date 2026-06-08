require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

const EXCLUDED_USERS = process.env.EXCLUDED_USERS
  ? process.env.EXCLUDED_USERS.split(',')
  : []; // Comma-separated usernames to never unfollow (set in .env)

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const v1 = client.v1;

// Rate limit safe delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch all pages of follower/friend IDs using v1.1 cursor-based pagination
const fetchAllIds = async (fetchFn) => {
  let ids = [];
  let cursor = -1;
  try {
    do {
      const response = await fetchFn(cursor);
      ids = ids.concat(response.ids);
      cursor = response.next_cursor;
    } while (cursor && cursor !== 0);
  } catch (error) {
    console.error('Error fetching IDs:', error.message || error);
  }
  return ids;
};

(async () => {
  try {
    // Fetch current authenticated user's screen_name and id
    const me = await v1.verifyCredentials();
    const MY_SCREEN_NAME = me.screen_name;
    console.log(`Authenticated as @${MY_SCREEN_NAME} (ID: ${me.id_str})`);

    // Fetch follower IDs (people who follow me)
    console.log('Fetching your followers...');
    const followerIds = await fetchAllIds((cursor) =>
      v1.get('followers/ids.json', {
        screen_name: MY_SCREEN_NAME,
        count: 5000,
        cursor,
      })
    );
    console.log(`Total followers: ${followerIds.length}`);

    // Fetch friend IDs (people I follow)
    console.log('Fetching accounts you follow...');
    const friendIds = await fetchAllIds((cursor) =>
      v1.get('friends/ids.json', {
        screen_name: MY_SCREEN_NAME,
        count: 5000,
        cursor,
      })
    );
    console.log(`Total following: ${friendIds.length}`);

    // Find non-reciprocal IDs
    const followerSet = new Set(followerIds.map(String));
    const nonFollowerIds = friendIds.filter((id) => !followerSet.has(String(id)));
    console.log(`Non-reciprocal accounts (raw count): ${nonFollowerIds.length}`);

    // Look up usernames for non-followers in batches of 100
    let nonFollowers = [];
    for (let i = 0; i < nonFollowerIds.length; i += 100) {
      const batch = nonFollowerIds.slice(i, i + 100);
      const users = await v1.get('users/lookup.json', {
        user_id: batch.join(','),
      });
      nonFollowers = nonFollowers.concat(users);
    }

    // Filter out excluded users
    const toUnfollow = nonFollowers.filter(
      (u) => !EXCLUDED_USERS.includes(u.screen_name)
    );

    console.log(`Accounts not following you back: ${toUnfollow.map((u) => u.screen_name).join(', ')}`);
    console.log(`Total to unfollow: ${toUnfollow.length}`);

    // Unfollow each
    for (const user of toUnfollow) {
      try {
        console.log(`Unfollowing @${user.screen_name}...`);
        await v1.post('friendships/destroy.json', { user_id: user.id_str });
        console.log(`Unfollowed @${user.screen_name}`);
        // ~50 unfollows per 15 min limit — 18s between calls
        await delay(18000);
      } catch (err) {
        console.error(`Failed to unfollow @${user.screen_name}:`, err.message || err);
      }
    }

    console.log('Done! Unfollowed all non-reciprocal accounts.');
  } catch (error) {
    console.error('Error:', error.message || error);
  }
})();
