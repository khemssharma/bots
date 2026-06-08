require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

const X_USER_ID = process.env.X_USER_ID; // Your numeric Twitter/X user ID
const EXCLUDED_USERS = process.env.EXCLUDED_USERS
  ? process.env.EXCLUDED_USERS.split(',')
  : []; // Comma-separated usernames to never unfollow (set in .env)

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const rwClient = client.readWrite;

// Fetch all paginated user IDs (followers or following)
const fetchAllUserIds = async (fetchFn) => {
  let ids = [];
  let paginationToken = undefined;
  try {
    do {
      const response = await fetchFn(paginationToken);
      if (response.data && response.data.length > 0) {
        ids = ids.concat(response.data.map((u) => ({ id: u.id, username: u.username })));
      }
      paginationToken = response.meta?.next_token;
    } while (paginationToken);
  } catch (error) {
    console.error('Error fetching user list:', error.message || error);
  }
  return ids;
};

// Rate limit safe delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    console.log('Fetching your followers...');
    const followers = await fetchAllUserIds((token) =>
      rwClient.v2.followers(X_USER_ID, {
        max_results: 1000,
        pagination_token: token,
        'user.fields': 'username',
      })
    );
    const followerIds = new Set(followers.map((u) => u.id));
    console.log(`Total followers: ${followerIds.size}`);

    console.log('Fetching accounts you follow...');
    const following = await fetchAllUserIds((token) =>
      rwClient.v2.following(X_USER_ID, {
        max_results: 1000,
        pagination_token: token,
        'user.fields': 'username',
      })
    );
    console.log(`Total following: ${following.length}`);

    // Identify non-reciprocal accounts
    const nonFollowers = following.filter(
      (u) => !followerIds.has(u.id) && !EXCLUDED_USERS.includes(u.username)
    );

    console.log(`Accounts not following you back: ${nonFollowers.map((u) => u.username).join(', ')}`);
    console.log(`Total to unfollow: ${nonFollowers.length}`);

    // Unfollow non-reciprocal accounts
    for (const user of nonFollowers) {
      try {
        console.log(`Unfollowing @${user.username}...`);
        await rwClient.v2.unfollow(X_USER_ID, user.id);
        console.log(`Unfollowed @${user.username}`);
        // Respect Twitter API rate limits: 50 unfollows per 15 min on free tier
        await delay(18000); // ~18 seconds between each unfollow
      } catch (err) {
        console.error(`Failed to unfollow @${user.username}:`, err.message || err);
      }
    }

    console.log('Done! Unfollowed all non-reciprocal accounts (excluding protected users).');
  } catch (error) {
    console.error('Error:', error.message || error);
  }
})();
