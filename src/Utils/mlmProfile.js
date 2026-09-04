const PROFILE_LOOKUP_BATCH_SIZE = 100;
const VALID_MOBILE_PATTERN = /^\d{10}$/;

export function normalizeMobile(value) {
  if (value === null || value === undefined) return "";

  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";

  // Mobile is the canonical users <-> mlmprofiles join key. Legacy records
  // sometimes include +91, 91, spaces, or separators, so compare the last
  // 10 digits consistently everywhere in the Marketing app.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function indexMlmProfiles(profiles = []) {
  const byMobile = new Map();

  for (const profile of profiles) {
    const mobile = normalizeMobile(profile?.mobile);
    if (!VALID_MOBILE_PATTERN.test(mobile) || byMobile.has(mobile)) continue;
    byMobile.set(mobile, profile);
  }

  return byMobile;
}

export function getMlmProfileByMobile(profilesByMobile, mobile) {
  const key = normalizeMobile(mobile);
  if (!VALID_MOBILE_PATTERN.test(key)) return null;
  return profilesByMobile.get(key) ?? null;
}

export function calculateMlmProfileStats(users = [], profiles = []) {
  const profilesByMobile = profiles instanceof Map
    ? profiles
    : indexMlmProfiles(profiles);

  let hasProfileCount = 0;

  for (const user of users) {
    if (getMlmProfileByMobile(profilesByMobile, user?.mobileNo)) {
      hasProfileCount += 1;
    }
  }

  const totalUsers = users.length;
  return {
    totalUsers,
    hasProfileCount,
    noProfileCount: totalUsers - hasProfileCount,
  };
}

function uniqueNormalizedMobiles(mobiles) {
  return [...new Set(
    mobiles
      .map(normalizeMobile)
      .filter(mobile => VALID_MOBILE_PATTERN.test(mobile))
  )];
}

function chunk(values, size) {
  const batches = [];
  for (let i = 0; i < values.length; i += size) {
    batches.push(values.slice(i, i + size));
  }
  return batches;
}

export async function fetchMlmProfiles(mobiles, profileLookup) {
  if (typeof profileLookup !== "function") {
    throw new TypeError("A profile lookup function is required.");
  }

  const requestedMobiles = uniqueNormalizedMobiles(mobiles);
  if (requestedMobiles.length === 0) return [];

  // The secure callable accepts up to 100 mobiles per request and performs
  // Firestore's 30-value `in` batching internally. Sending up to 100 here
  // avoids repeating session/authorization/team reads for every 30 mobiles.
  const responses = await Promise.all(
    chunk(requestedMobiles, PROFILE_LOOKUP_BATCH_SIZE)
      .map(batch => profileLookup({ mobiles: batch }))
  );

  const requestedSet = new Set(requestedMobiles);
  const profilesByMobile = new Map();

  for (const response of responses) {
    const profiles = Array.isArray(response?.data?.profiles)
      ? response.data.profiles
      : [];

    for (const profile of profiles) {
      const mobile = normalizeMobile(profile?.mobile);
      if (!mobile || !requestedSet.has(mobile) || profilesByMobile.has(mobile)) {
        continue;
      }
      profilesByMobile.set(mobile, profile);
    }
  }

  return [...profilesByMobile.values()];
}
