/* global require, exports, Buffer */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { promisify } = require("util");
const {
  EMAIL_PATTERN,
  normalizeEmail,
  maskEmail,
  buildMarketingOtpMessage,
} = require("./marketingEmailOtp");
const {
  calculateTeamMemberSummary,
  toMillis,
  daysUntil,
  subscriptionStatus,
  buildSanitizedLead,
} = require("./marketingTeamMetrics");

initializeApp();
const db = getFirestore();
const scrypt = promisify(crypto.scrypt);
const EMAIL_PASS = defineSecret("EMAIL_PASS");
const EMAIL_NODEMAILER = defineString("EMAIL_NODEMAILER", { default: "soilbooster717@gmail.com" });
const REGION = "asia-south1";
const SESSION_MS = 10 * 60 * 60 * 1000;
const OTP_MS = 5 * 60 * 1000;
const ALL_TABS = ["dashboard", "reports", "leads", "freshleads", "taskmanagement", "team", "portalusers", "callingteam", "security"];

const mobile10 = value => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const cleanText = (value, max = 120) => String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
const safeTabs = value => Array.isArray(value) ? [...new Set(value.filter(tab => ALL_TABS.includes(tab)))].slice(0, 20) : [];
const ipOf = request => String(request.rawRequest?.headers?.["x-forwarded-for"] || request.rawRequest?.ip || "Unavailable").split(",")[0].trim();
const locationOf = request => {
  const headers = request.rawRequest?.headers || {};
  return [headers["x-appengine-city"], headers["x-appengine-region"], headers["x-appengine-country"]]
    .filter(Boolean).map(value => cleanText(value, 60)).join(", ") || "Location unavailable";
};
const deviceOf = request => ({
  label: cleanText(request.data?.device?.label || "Unknown device", 100),
  browser: cleanText(request.data?.device?.browser || "Unknown browser", 60),
  os: cleanText(request.data?.device?.os || "Unknown OS", 60),
  language: cleanText(request.data?.device?.language || "", 20),
  timezone: cleanText(request.data?.device?.timezone || "", 60),
  userAgent: cleanText(request.rawRequest?.headers?.["user-agent"] || "", 300),
});

function strongPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 12 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

async function rateLimit(bucket, key, max, windowMs) {
  const ref = db.collection("_panelLoginLimits").doc(hash(`${bucket}:${key}`));
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const now = Date.now(), data = snapshot.exists ? snapshot.data() : {};
    const sameWindow = now - Number(data.windowStart || 0) < windowMs;
    const count = sameWindow ? Number(data.count || 0) : 0;
    if (count >= max) throw new HttpsError("resource-exhausted", "Too many attempts. Try again later.");
    transaction.set(ref, {
      bucket,
      count: count + 1,
      windowStart: sameWindow ? data.windowStart : now,
      expiresAt: Timestamp.fromMillis(now + windowMs),
    });
  });
}

async function ownerForEmail(email) {
  const emailOwner = await db.collection("_marketingEmailOwners").doc(hash(email)).get();
  if (emailOwner.exists) {
    const owner = await ownerForId(emailOwner.data().mteamId);
    if (normalizeEmail(owner.data().loginEmail) !== email) throw new HttpsError("permission-denied", "No active Marketing account is registered for this email. Contact Admin.");
    return owner;
  }
  const snapshot = await db.collection("mteam").where("loginEmail", "==", email).limit(2).get();
  const active = snapshot.docs.filter(document => document.data().active === true);
  if (active.length !== 1) throw new HttpsError("permission-denied", "No active Marketing account is registered for this email. Contact Admin.");
  return active[0];
}

async function ownerForId(ownerId) {
  const owner = await db.collection("mteam").doc(String(ownerId || "")).get();
  if (!owner.exists || owner.data().active !== true || !EMAIL_PATTERN.test(normalizeEmail(owner.data().loginEmail))) {
    throw new HttpsError("permission-denied", "Marketing account is inactive or its login email is not configured.");
  }
  return owner;
}

async function teamFor(owner) {
  let changed = false;
  const team = (Array.isArray(owner.data().team) ? owner.data().team : []).map(user => {
    const { password, pin, ...safe } = user || {};
    if (password !== undefined || pin !== undefined || !safe.id) changed = true;
    return { ...safe, id: safe.id || crypto.randomUUID() };
  });
  if (changed) await owner.ref.update({ team, updatedAt: FieldValue.serverTimestamp() });
  return team;
}

async function actorsFor(owner) {
  const team = await teamFor(owner);
  const actors = [
    { id: owner.id, name: owner.data().name || "Marketing Member", actorType: "owner" },
    ...team.filter(user => user.active !== false).map(user => ({ id: user.id, name: user.name || "Portal User", actorType: "subuser" })),
  ];
  const credentials = await Promise.all(actors.map(actor => db.collection("_panelCredentials").doc(hash(`marketing:${owner.id}:${actor.id}`)).get()));
  return actors.map((actor, index) => ({ ...actor, passwordConfigured: credentials[index].exists }));
}

async function actorFor(owner, actorId) {
  if (actorId === owner.id) {
    return { id: owner.id, name: owner.data().name || "Marketing Member", mobile: mobile10(owner.data().mobile), actorType: "owner", tabs: ALL_TABS };
  }
  const team = await teamFor(owner);
  const user = team.find(item => item.id === actorId && item.active !== false);
  if (!user) throw new HttpsError("permission-denied", "Account is not authorised.");
  return { ...user, actorType: "subuser" };
}

async function sendEmailOtp(recipient, otp, memberName) {
  const sender = normalizeEmail(EMAIL_NODEMAILER.value());
  const password = EMAIL_PASS.value();
  if (!EMAIL_PATTERN.test(sender) || !password) throw new HttpsError("failed-precondition", "Email OTP service is not configured.");
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: sender, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await transporter.sendMail(buildMarketingOtpMessage(sender, recipient, otp, memberName));
  } catch (error) {
    console.error("Marketing email OTP delivery failed", { code: error?.code || "unknown" });
    throw new HttpsError("unavailable", "Email OTP could not be sent right now.");
  }
}

async function createEmailChallenge(owner) {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString("hex");
  const id = crypto.randomBytes(24).toString("hex");
  const email = normalizeEmail(owner.data().loginEmail);
  const ref = db.collection("_panelOtpChallenges").doc(id);
  await ref.set({
    panel: "marketing",
    delivery: "email",
    ownerId: owner.id,
    recipientHash: hash(email),
    salt,
    otpHash: hash(`${salt}:${otp}`),
    attempts: 0,
    verified: false,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_MS),
  });
  try {
    await sendEmailOtp(email, otp, owner.data().name || "Marketing Member");
  } catch (error) {
    await ref.delete().catch(() => null);
    throw error;
  }
  return id;
}

async function verifyChallenge(id, otp) {
  const ref = db.collection("_panelOtpChallenges").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("unauthenticated", "OTP session expired.");
  const data = snapshot.data();
  if (data.panel !== "marketing" || data.delivery !== "email" || data.used || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new HttpsError("unauthenticated", "OTP session expired.");
  }
  if (Number(data.attempts || 0) >= 5) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Too many incorrect attempts.");
  }
  if (hash(`${data.salt}:${otp}`) !== data.otpHash) {
    await ref.update({ attempts: FieldValue.increment(1) });
    throw new HttpsError("unauthenticated", "Incorrect OTP.");
  }
  const ticket = crypto.randomBytes(32).toString("hex");
  await ref.update({
    verified: true,
    ticketHash: hash(ticket),
    ticketExpiresAt: Timestamp.fromMillis(Date.now() + OTP_MS),
    otpHash: FieldValue.delete(),
    salt: FieldValue.delete(),
  });
  return { ...data, ticket };
}

async function readTicket(id, ticket) {
  const ref = db.collection("_panelOtpChallenges").doc(id), snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("unauthenticated", "Login session expired.");
  const data = snapshot.data();
  if (data.panel !== "marketing" || data.delivery !== "email" || !data.verified || data.used || data.ticketExpiresAt.toMillis() < Date.now() || data.ticketHash !== hash(ticket)) {
    throw new HttpsError("unauthenticated", "Login session expired.");
  }
  return { ref, data };
}

async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64)).toString("hex");
}

async function verifyOrCreatePassword(ownerId, actorId, password, allowCreate) {
  if (!strongPassword(password)) throw new HttpsError("invalid-argument", "Password must be 8–12 characters with uppercase, lowercase, number and special character.");
  const ref = db.collection("_panelCredentials").doc(hash(`marketing:${ownerId}:${actorId}`)), snapshot = await ref.get();
  if (!snapshot.exists) {
    if (!allowCreate) throw new HttpsError("failed-precondition", "Set password using OTP login first.");
    const salt = crypto.randomBytes(24).toString("hex");
    await ref.create({ panel: "marketing", ownerId, actorId, salt, passwordHash: await passwordHash(password, salt), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  const data = snapshot.data(), actual = await passwordHash(password, data.salt);
  const actualBuffer = Buffer.from(actual, "hex"), expectedBuffer = Buffer.from(String(data.passwordHash || ""), "hex");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new HttpsError("unauthenticated", "Incorrect password.");
  }
}

function publicSession(document) {
  const data = document.data();
  return {
    id: document.id,
    actorId: data.actorId,
    actorName: data.actorName,
    actorType: data.actorType,
    ip: data.ip,
    location: data.location,
    device: data.device,
    createdAt: toMillis(data.createdAt),
    lastSeenAt: toMillis(data.lastSeenAt),
    expiresAt: toMillis(data.expiresAt),
    revoked: data.revoked === true,
  };
}

async function sessionFor(request) {
  if (request.auth?.token?.panel !== "marketing") throw new HttpsError("unauthenticated", "Sign in required.");
  const ref = db.collection("_panelSessions").doc(request.auth.uid), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().panel !== "marketing" || snapshot.data().revoked === true || snapshot.data().expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("unauthenticated", "Session expired.");
  }
  const owner = await ownerForId(snapshot.data().ownerId);
  if (owner.id !== request.auth.token.mteamId) throw new HttpsError("permission-denied", "Session does not match this Marketing account.");
  if (request.auth.token.actorType === "subuser") {
    const team = await teamFor(owner);
    if (!team.some(user => user.id === request.auth.token.subUserId && user.active !== false)) throw new HttpsError("permission-denied", "Portal user is inactive.");
  }
  return { ref, data: snapshot.data(), owner };
}

async function couponForMember(member) {
  if (member.data().assign_coupon_id) {
    const coupon = await db.collection("couponcode").doc(String(member.data().assign_coupon_id)).get();
    if (coupon.exists) return coupon;
  }
  const snapshot = await db.collection("couponcode").where("assigned_user.id", "==", member.id).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
}

async function accountPublic(owner) {
  const [coupon, parent] = await Promise.all([
    couponForMember(owner),
    owner.data().parentMteamId ? db.collection("mteam").doc(String(owner.data().parentMteamId)).get() : Promise.resolve(null),
  ]);
  const commission = owner.data().commissionPercentage === undefined
    ? Number(coupon?.data()?.marketing_member_percentage || 0)
    : Number(owner.data().commissionPercentage || 0);
  return {
    mteamId: owner.id,
    name: cleanText(owner.data().name || "Marketing Member", 80),
    mobile: mobile10(owner.data().mobile),
    loginEmailMasked: maskEmail(owner.data().loginEmail),
    parentMteamId: String(owner.data().parentMteamId || ""),
    parentName: parent?.exists ? cleanText(parent.data().name, 80) : "",
    commissionPercentage: commission,
    uplineBonusPercentage: Number(owner.data().uplineBonusPercentage === undefined ? 10 : owner.data().uplineBonusPercentage),
    couponCode: cleanText(coupon?.data()?.code, 12),
    referCode: cleanText(owner.data().referCode || coupon?.data()?.referCode, 12),
  };
}

exports.marketingStartTwoFactorOtp = onCall({ region: REGION, cors: true, secrets: [EMAIL_PASS] }, async request => {
  const email = normalizeEmail(request.data?.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new HttpsError("invalid-argument", "Enter a valid registered email.");
  await rateLimit("marketing_email_otp_ip", ipOf(request), 8, 10 * 60 * 1000);
  const owner = await ownerForEmail(email);
  await Promise.all([
    rateLimit("marketing_email_otp_cooldown", owner.id, 1, 60 * 1000),
    rateLimit("marketing_email_otp_owner", owner.id, 3, 10 * 60 * 1000),
  ]);
  return { challengeId: await createEmailChallenge(owner), delivery: "email", maskedEmail: maskEmail(email) };
});

exports.marketingVerifyTwoFactorOtp = onCall({ region: REGION, cors: true }, async request => {
  const id = String(request.data?.challengeId || ""), otp = String(request.data?.otp || "");
  if (!/^[a-f0-9]{48}$/.test(id) || !/^\d{6}$/.test(otp)) throw new HttpsError("invalid-argument", "Enter a valid 6-digit OTP.");
  await rateLimit("marketing_email_verify_ip", ipOf(request), 20, 10 * 60 * 1000);
  const verified = await verifyChallenge(id, otp), owner = await ownerForId(verified.ownerId);
  return { loginTicket: verified.ticket, actors: await actorsFor(owner) };
});

exports.marketingCreateSessionFromTwoFactor = onCall({ region: REGION, cors: true }, async request => {
  const challengeId = String(request.data?.challengeId || ""), ticket = String(request.data?.loginTicket || "");
  const actorId = String(request.data?.actorId || ""), password = String(request.data?.password || "");
  await rateLimit("marketing_password_ip", ipOf(request), 20, 10 * 60 * 1000);
  const { ref: challengeRef, data: verified } = await readTicket(challengeId, ticket);
  const owner = await ownerForId(verified.ownerId), actor = await actorFor(owner, actorId);
  await verifyOrCreatePassword(owner.id, actor.id, password, true);
  await challengeRef.update({ used: true, ticketHash: FieldValue.delete() });
  const claims = {
    panel: "marketing",
    actorType: actor.actorType,
    mteamId: owner.id,
    subUserId: actor.actorType === "subuser" ? actor.id : "",
    name: cleanText(actor.name || "Member", 80),
    mobile: mobile10(actor.mobile || owner.data().mobile),
    parentMobile: mobile10(owner.data().mobile),
    tabs: actor.actorType === "owner" ? ALL_TABS : safeTabs(actor.tabs),
  };
  const uid = `panel_${hash(`marketing:${owner.id}:${actor.id}:${crypto.randomBytes(24).toString("hex")}`).slice(0, 48)}`;
  const prior = await db.collection("_panelSessions").where("ownerId", "==", owner.id).get();
  const previous = prior.docs.map(publicSession).filter(session => session.actorId === actor.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  const now = Timestamp.now(), expiresAt = Timestamp.fromMillis(Date.now() + SESSION_MS);
  await db.collection("_panelSessions").doc(uid).set({
    panel: "marketing", ownerId: owner.id, actorId: actor.id, actorName: claims.name, actorType: actor.actorType,
    ip: ipOf(request), location: locationOf(request), device: deviceOf(request), createdAt: now, lastSeenAt: now, expiresAt, revoked: false,
  });
  return { token: await getAuth().createCustomToken(uid, claims), expiresAt: expiresAt.toMillis(), loginAlert: previous };
});

exports.marketingSessionStatus = onCall({ region: REGION, cors: true }, async request => {
  const { ref, data, owner } = await sessionFor(request);
  await ref.update({ lastSeenAt: FieldValue.serverTimestamp() });
  return { valid: true, expiresAt: data.expiresAt.toMillis(), account: await accountPublic(owner) };
});

exports.marketingUnlockSession = onCall({ region: REGION, cors: true }, async request => {
  const { ref, data } = await sessionFor(request);
  await rateLimit("marketing_unlock", `${request.auth.uid}:${ipOf(request)}`, 10, 15 * 60 * 1000);
  await verifyOrCreatePassword(data.ownerId, data.actorId, String(request.data?.password || ""), false);
  await ref.update({ lastSeenAt: FieldValue.serverTimestamp(), lastUnlockAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

exports.marketingListSessions = onCall({ region: REGION, cors: true }, async request => {
  const { data } = await sessionFor(request);
  const snapshot = await db.collection("_panelSessions").where("ownerId", "==", data.ownerId).get();
  const all = request.auth.token.actorType === "owner";
  return { currentSessionId: request.auth.uid, sessions: snapshot.docs.map(publicSession).filter(session => all || session.actorId === data.actorId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100) };
});

exports.marketingRevokeSession = onCall({ region: REGION, cors: true }, async request => {
  const { data } = await sessionFor(request), id = String(request.data?.sessionId || "");
  const target = await db.collection("_panelSessions").doc(id).get();
  if (!target.exists || target.data().ownerId !== data.ownerId || (request.auth.token.actorType !== "owner" && target.data().actorId !== data.actorId)) throw new HttpsError("permission-denied", "Not authorised.");
  await target.ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(0) });
  try { await getAuth().revokeRefreshTokens(id); } catch { /* session document revocation is immediate */ }
  return { ok: true, current: id === request.auth.uid };
});

exports.marketingPanelLogout = onCall({ region: REGION, cors: true }, async request => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Not signed in.");
  await db.collection("_panelSessions").doc(request.auth.uid).delete();
  try { await getAuth().revokeRefreshTokens(request.auth.uid); } catch { /* deleted session denies access */ }
  return { ok: true };
});

exports.marketingGetProfiles = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await sessionFor(request);
  const requested = [...new Set(
    (request.data?.mobiles || []).map(mobile10).filter(mobile => /^\d{10}$/.test(mobile)),
  )].slice(0, 5000);
  if (requested.length === 0) return { profiles: [] };

  // Read the referred-user authorization set once per large request. The client
  // batches up to 5,000 mobiles now, so a normal dashboard no longer repeats
  // this full scan for every 100 users.
  const users = await db.collection("users").where("referredByMteam", "==", owner.id).get();
  const allowed = new Set(users.docs.map(document => mobile10(document.data().mobileNo)));
  const mobiles = requested.filter(mobile => allowed.has(mobile));
  const profiles = [];
  for (let index = 0; index < mobiles.length; index += 30) {
    const snapshot = await db.collection("mlmprofiles")
      .where("mobile", "in", mobiles.slice(index, index + 30)).get();
    for (const document of snapshot.docs) profiles.push({ id: document.id, ...document.data() });
  }
  return { profiles };
});

async function successfulSubscriptions(couponCode) {
  if (!couponCode) return [];
  const snapshot = await db.collection("subscription").where("couponApplied", "==", couponCode).where("payment", "==", "Success").get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

exports.marketingGetMyTeam = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await sessionFor(request);
  if (request.auth.token.actorType !== "owner") throw new HttpsError("permission-denied", "Only the Marketing member can view assigned Marketing team members.");
  const children = await db.collection("mteam").where("parentMteamId", "==", owner.id).get();
  const members = await Promise.all(children.docs.map(async child => {
    const coupon = await couponForMember(child);
    const couponCode = cleanText(coupon?.data()?.code, 12);
    const [subscriptions, userCount] = await Promise.all([
      successfulSubscriptions(couponCode),
      db.collection("users").where("referredByMteam", "==", child.id).count().get(),
    ]);
    const commissionPercentage = child.data().commissionPercentage === undefined
      ? Number(coupon?.data()?.marketing_member_percentage || 0)
      : Number(child.data().commissionPercentage || 0);
    const uplineBonusPercentage = Number(child.data().uplineBonusPercentage === undefined ? 10 : child.data().uplineBonusPercentage);
    return {
      id: child.id,
      name: cleanText(child.data().name || "Marketing Member", 80),
      loginEmailMasked: maskEmail(child.data().loginEmail),
      active: child.data().active === true,
      commissionPercentage,
      uplineBonusPercentage,
      couponCode,
      referCode: cleanText(child.data().referCode || coupon?.data()?.referCode, 12),
      ...calculateTeamMemberSummary({ subscriptions, userCount: userCount.data().count, commissionPercentage, uplineBonusPercentage }),
    };
  }));
  members.sort((a, b) => a.name.localeCompare(b.name));
  return {
    members,
    teamBonusTotal: Math.round(members.reduce((total, member) => total + member.parentBonus, 0) * 100) / 100,
  };
});

function latestSubscriptionsByMobile(subscriptions) {
  const result = new Map();
  for (const subscription of subscriptions) {
    const mobile = mobile10(subscription.mobileNo);
    if (!mobile) continue;
    const previous = result.get(mobile);
    if (!previous || (toMillis(subscription.PurchaseAt) || 0) > (toMillis(previous.PurchaseAt) || 0)) result.set(mobile, subscription);
  }
  return result;
}

exports.marketingGetTeamMemberLeads = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await sessionFor(request);
  if (request.auth.token.actorType !== "owner") throw new HttpsError("permission-denied", "Only the Marketing member can view assigned Marketing team data.");
  const memberId = String(request.data?.memberId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) throw new HttpsError("invalid-argument", "Invalid team member ID.");
  const member = await db.collection("mteam").doc(memberId).get();
  if (!member.exists || String(member.data().parentMteamId || "") !== owner.id) throw new HttpsError("permission-denied", "This Marketing member is not in your direct team.");
  const coupon = await couponForMember(member), couponCode = cleanText(coupon?.data()?.code, 12);
  const usersQuery = db.collection("users").where("referredByMteam", "==", member.id);
  const [usersSnapshot, usersCount, subscriptions, followupsSnapshot] = await Promise.all([
    usersQuery.limit(5000).get(),
    usersQuery.count().get(),
    successfulSubscriptions(couponCode),
    db.collection("leadBysubuserMarketingMember").where("mteamId", "==", member.id).get(),
  ]);
  const mobiles = [...new Set(usersSnapshot.docs.map(document => mobile10(document.data().mobileNo)).filter(mobile => /^\d{10}$/.test(mobile)))];
  const profiles = [];
  for (let index = 0; index < mobiles.length; index += 30) {
    const snapshot = await db.collection("mlmprofiles").where("mobile", "in", mobiles.slice(index, index + 30)).get();
    for (const document of snapshot.docs) profiles.push(document.data());
  }
  const profilesByMobile = new Map();
  for (const profile of profiles) {
    const mobile = mobile10(profile.mobile);
    if (mobile && !profilesByMobile.has(mobile)) profilesByMobile.set(mobile, profile);
  }
  const subscriptionsByMobile = latestSubscriptionsByMobile(subscriptions);
  const followupsByUser = new Map(followupsSnapshot.docs.map(document => [String(document.data().userId || ""), document.data()]));
  const leads = usersSnapshot.docs.map(document => {
    const user = document.data(), mobile = mobile10(user.mobileNo);
    return buildSanitizedLead({
      opaqueId: hash(`team-lead:${member.id}:${document.id}`).slice(0, 24),
      user,
      subscription: subscriptionsByMobile.get(mobile) || null,
      profile: profilesByMobile.get(mobile) || null,
      followup: followupsByUser.get(document.id) || null,
      couponCode,
    });
  }).sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  return {
    member: {
      id: member.id,
      name: cleanText(member.data().name || "Marketing Member", 80),
      commissionPercentage: Number(member.data().commissionPercentage ?? coupon?.data()?.marketing_member_percentage ?? 0),
      couponCode,
    },
    leads,
    totalUsers: usersCount.data().count,
    truncated: usersCount.data().count > leads.length,
    privacy: { mobileHidden: true, passwordHidden: true, readOnly: true },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Calling Team: tracking-only referral attribution + isolated secure panel
// ─────────────────────────────────────────────────────────────────────────────
const CALLING_TEAM_COLLECTION = "marketingCallingTeam";
const CALLING_EMAIL_OWNER_COLLECTION = "_callingEmailOwners";
const CALLING_CODE_OWNER_COLLECTION = "_callingCodeOwners";
const CALLING_FOLLOWUP_COLLECTION = "callingTeamLeadFollowups";
const CALLING_REFERRAL_CLAIM_COLLECTION = "_callingReferralClaims";
const CALLING_REFERRAL_CLAIM_MS = 15 * 60 * 1000;

const CALLING_STATUSES = new Set(["New", "Contacted", "Follow Up", "Interested", "Converted", "Lost", "Renewal Follow Up"]);

function normalizeCallingCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
}

function validateCallingMemberInput(data = {}) {
  const name = cleanText(data.name, 80);
  const email = normalizeEmail(data.email);
  const mobile = mobile10(data.mobile);
  const code = normalizeCallingCode(data.code);
  if (name.length < 2) throw new HttpsError("invalid-argument", "Calling member name is required.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new HttpsError("invalid-argument", "Enter a valid calling member email.");
  if (!/^\d{10}$/.test(mobile)) throw new HttpsError("invalid-argument", "Enter a valid 10-digit mobile number.");
  if (!/^[A-Z0-9_-]{4,12}$/.test(code)) throw new HttpsError("invalid-argument", "Calling code must be 4-12 letters/numbers.");
  return { name, email, mobile, code };
}

async function requireMarketingOwner(request) {
  const context = await sessionFor(request);
  if (request.auth.token.actorType !== "owner") {
    throw new HttpsError("permission-denied", "Only the Marketing member can manage Calling Team.");
  }
  return context;
}

async function callingMemberForId(memberId) {
  const snapshot = await db.collection(CALLING_TEAM_COLLECTION).doc(String(memberId || "")).get();
  if (!snapshot.exists || snapshot.data().active !== true) {
    throw new HttpsError("permission-denied", "Calling Team account is inactive.");
  }
  return snapshot;
}

async function callingMemberForEmail(email) {
  const mapping = await db.collection(CALLING_EMAIL_OWNER_COLLECTION).doc(hash(email)).get();
  if (!mapping.exists) throw new HttpsError("permission-denied", "No active Calling Team account is registered for this email.");
  const member = await callingMemberForId(mapping.data().callingMemberId);
  if (normalizeEmail(member.data().email) !== email) throw new HttpsError("permission-denied", "Calling Team email mapping is invalid.");
  await ownerForId(member.data().ownerId);
  return member;
}

async function createCallingEmailChallenge(member) {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString("hex");
  const id = crypto.randomBytes(24).toString("hex");
  const email = normalizeEmail(member.data().email);
  const ref = db.collection("_panelOtpChallenges").doc(id);
  await ref.set({
    panel: "calling",
    delivery: "email",
    ownerId: member.data().ownerId,
    callingMemberId: member.id,
    recipientHash: hash(email),
    salt,
    otpHash: hash(`${salt}:${otp}`),
    attempts: 0,
    verified: false,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_MS),
  });
  try {
    await sendEmailOtp(email, otp, member.data().name || "Calling Team Member");
  } catch (error) {
    await ref.delete().catch(() => null);
    throw error;
  }
  return id;
}

async function verifyCallingChallenge(id, otp) {
  const ref = db.collection("_panelOtpChallenges").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("unauthenticated", "OTP session expired.");
  const data = snapshot.data();
  if (data.panel !== "calling" || data.delivery !== "email" || data.used || data.expiresAt.toMillis() < Date.now()) {
    await ref.delete().catch(() => null);
    throw new HttpsError("unauthenticated", "OTP session expired.");
  }
  if (Number(data.attempts || 0) >= 5) {
    await ref.delete().catch(() => null);
    throw new HttpsError("resource-exhausted", "Too many incorrect attempts.");
  }
  if (hash(`${data.salt}:${otp}`) !== data.otpHash) {
    await ref.update({ attempts: FieldValue.increment(1) });
    throw new HttpsError("unauthenticated", "Incorrect OTP.");
  }
  const ticket = crypto.randomBytes(32).toString("hex");
  await ref.update({
    verified: true,
    ticketHash: hash(ticket),
    ticketExpiresAt: Timestamp.fromMillis(Date.now() + OTP_MS),
    otpHash: FieldValue.delete(),
    salt: FieldValue.delete(),
  });
  return { ...data, ticket };
}

async function readCallingTicket(id, ticket) {
  const ref = db.collection("_panelOtpChallenges").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("unauthenticated", "Login session expired.");
  const data = snapshot.data();
  if (data.panel !== "calling" || data.delivery !== "email" || !data.verified || data.used || data.ticketExpiresAt.toMillis() < Date.now() || data.ticketHash !== hash(ticket)) {
    throw new HttpsError("unauthenticated", "Login session expired.");
  }
  return { ref, data };
}

async function verifyOrCreateCallingPassword(memberId, password, allowCreate) {
  if (!strongPassword(password)) throw new HttpsError("invalid-argument", "Password must be 8–12 characters with uppercase, lowercase, number and special character.");
  const ref = db.collection("_panelCredentials").doc(hash(`calling:${memberId}`));
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    if (!allowCreate) throw new HttpsError("failed-precondition", "Set password using OTP login first.");
    const salt = crypto.randomBytes(24).toString("hex");
    await ref.create({ panel: "calling", callingMemberId: memberId, salt, passwordHash: await passwordHash(password, salt), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return;
  }
  const data = snapshot.data();
  const actual = await passwordHash(password, data.salt);
  const actualBuffer = Buffer.from(actual, "hex"), expectedBuffer = Buffer.from(String(data.passwordHash || ""), "hex");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new HttpsError("unauthenticated", "Incorrect password.");
  }
}

async function callingSessionFor(request) {
  if (request.auth?.token?.panel !== "calling") throw new HttpsError("unauthenticated", "Calling Team sign in required.");
  const ref = db.collection("_panelSessions").doc(request.auth.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().panel !== "calling" || snapshot.data().revoked === true || snapshot.data().expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("unauthenticated", "Session expired.");
  }
  const member = await callingMemberForId(snapshot.data().callingMemberId);
  const owner = await ownerForId(member.data().ownerId);
  if (request.auth.token.callingMemberId !== member.id || request.auth.token.mteamId !== owner.id) {
    throw new HttpsError("permission-denied", "Session does not match this Calling Team account.");
  }
  return { ref, data: snapshot.data(), member, owner };
}

function callingMemberPublic(document, stats = {}) {
  const data = document.data();
  return {
    id: document.id,
    name: cleanText(data.name, 80),
    email: normalizeEmail(data.email),
    emailMasked: maskEmail(data.email),
    mobile: mobile10(data.mobile),
    code: normalizeCallingCode(data.code),
    active: data.active === true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    totalUsers: Number(stats.totalUsers || 0),
    todayUsers: Number(stats.todayUsers || 0),
    monthUsers: Number(stats.monthUsers || 0),
  };
}

function dateStartMs(days = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (days) d.setDate(d.getDate() - days);
  return d.getTime();
}

function monthStartMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function safeCallingLead({ userDoc, subscription = null, profile = null, followup = null, caller = null } = {}) {
  const user = userDoc.data();
  return {
    id: userDoc.id,
    name: cleanText(user.name || subscription?.UserName || "User", 80),
    mobile: mobile10(user.mobileNo),
    joinedAt: toMillis(user.createdAt),
    lastDownloadAt: toMillis(user.lastDownloadAt),
    verified: user.isverified === true,
    referredBy: cleanText(user.referredBy || "", 80),
    callingTeamId: String(user.callingTeamId || ""),
    callingTeamCode: normalizeCallingCode(user.callingTeamCode || caller?.data()?.code || ""),
    hasMlmProfile: Boolean(profile),
    companyName: cleanText(profile?.companyName || subscription?.company || "", 100),
    profileName: cleanText(profile?.name || profile?.fullName || "", 80),
    plan: cleanText(subscription?.plan || "", 80),
    planType: cleanText(subscription?.planType || "", 50),
    planStatus: subscriptionStatus(subscription),
    paymentAmount: Number(subscription?.PaymentAmount || 0),
    startDate: cleanText(subscription?.startdate || "", 40),
    expiryDate: cleanText(subscription?.expirydate || "", 40),
    daysLeft: daysUntil(subscription?.expirydate),
    couponApplied: cleanText(subscription?.couponApplied || "", 20),
    leadStatus: cleanText(followup?.leadStatus || "New", 40),
    nextFollowupDate: cleanText(followup?.nextFollowupDate || "", 40),
    lastNote: cleanText(followup?.lastNote || "", 500),
    lastFollowupAt: toMillis(followup?.updatedAt),
  };
}

async function callingLeadsBundle(owner, member, maxUsers = 5000) {
  const usersQuery = db.collection("users")
    .where("referredByMteam", "==", owner.id)
    .where("callingTeamId", "==", member.id);
  const [usersSnapshot, totalSnapshot, coupon, followupsSnapshot] = await Promise.all([
    usersQuery.limit(maxUsers).get(),
    usersQuery.count().get(),
    couponForMember(owner),
    db.collection(CALLING_FOLLOWUP_COLLECTION).where("ownerId", "==", owner.id).where("callingMemberId", "==", member.id).get(),
  ]);
  const users = usersSnapshot.docs;
  const mobiles = [...new Set(users.map(document => mobile10(document.data().mobileNo)).filter(mobile => /^\d{10}$/.test(mobile)))];
  const couponCode = cleanText(coupon?.data()?.code, 12);
  const [subscriptions, profiles] = await Promise.all([
    successfulSubscriptions(couponCode),
    (async () => {
      const output = [];
      for (let index = 0; index < mobiles.length; index += 30) {
        const batch = mobiles.slice(index, index + 30);
        if (!batch.length) continue;
        const snapshot = await db.collection("mlmprofiles").where("mobile", "in", batch).get();
        for (const document of snapshot.docs) output.push(document.data());
      }
      return output;
    })(),
  ]);
  const profilesByMobile = new Map();
  for (const profile of profiles) {
    const mobile = mobile10(profile.mobile);
    if (mobile && !profilesByMobile.has(mobile)) profilesByMobile.set(mobile, profile);
  }
  const subscriptionsByMobile = latestSubscriptionsByMobile(subscriptions);
  const followupsByUser = new Map(followupsSnapshot.docs.map(document => [String(document.data().userId || ""), document.data()]));
  const leads = users.map(userDoc => {
    const mobile = mobile10(userDoc.data().mobileNo);
    return safeCallingLead({
      userDoc,
      subscription: subscriptionsByMobile.get(mobile) || null,
      profile: profilesByMobile.get(mobile) || null,
      followup: followupsByUser.get(userDoc.id) || null,
      caller: member,
    });
  }).sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  return { leads, totalUsers: totalSnapshot.data().count, truncated: totalSnapshot.data().count > leads.length, couponCode };
}

function summarizeCallingLeads(leads = []) {
  const today = dateStartMs();
  const month = monthStartMs();
  const companies = {};
  const statuses = {};
  let todayUsers = 0, monthUsers = 0, activePlan = 0, noPlan = 0, expired = 0, hasProfile = 0, expiring7 = 0, expiring15 = 0;
  for (const lead of leads) {
    if ((lead.joinedAt || 0) >= today) todayUsers += 1;
    if ((lead.joinedAt || 0) >= month) monthUsers += 1;
    if (lead.planStatus === "Active") activePlan += 1;
    else if (lead.planStatus === "No Plan") noPlan += 1;
    else if (lead.planStatus === "Expired") expired += 1;
    if (Number.isFinite(lead.daysLeft) && lead.daysLeft >= 0 && lead.daysLeft <= 7) expiring7 += 1;
    if (Number.isFinite(lead.daysLeft) && lead.daysLeft >= 0 && lead.daysLeft <= 15) expiring15 += 1;
    if (lead.hasMlmProfile) hasProfile += 1;
    if (lead.companyName) companies[lead.companyName] = (companies[lead.companyName] || 0) + 1;
    statuses[lead.leadStatus || "New"] = (statuses[lead.leadStatus || "New"] || 0) + 1;
  }
  return {
    totalUsers: leads.length,
    todayUsers,
    monthUsers,
    activePlan,
    noPlan,
    expired,
    expiring7,
    expiring15,
    hasProfile,
    noProfile: leads.length - hasProfile,
    companies,
    statuses,
  };
}

exports.marketingListCallingTeam = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const membersSnapshot = await db.collection(CALLING_TEAM_COLLECTION).where("ownerId", "==", owner.id).get();
  const today = Timestamp.fromMillis(dateStartMs()), month = Timestamp.fromMillis(monthStartMs());
  const members = await Promise.all(membersSnapshot.docs.map(async document => {
    const base = db.collection("users")
      .where("referredByMteam", "==", owner.id)
      .where("callingTeamId", "==", document.id);
    const [total, todayCount, monthCount] = await Promise.all([
      base.count().get(),
      base.where("createdAt", ">=", today).count().get(),
      base.where("createdAt", ">=", month).count().get(),
    ]);
    return callingMemberPublic(document, {
      totalUsers: total.data().count,
      todayUsers: todayCount.data().count,
      monthUsers: monthCount.data().count,
    });
  }));
  members.sort((a, b) => a.name.localeCompare(b.name));
  return {
    members,
    totalMembers: members.length,
    activeMembers: members.filter(member => member.active).length,
    totalTrackedUsers: members.reduce((sum, member) => sum + member.totalUsers, 0),
  };
});

exports.marketingCreateCallingMember = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const input = validateCallingMemberInput(request.data);
  const [marketingEmail, couponConflict] = await Promise.all([
    db.collection("mteam").where("loginEmail", "==", input.email).limit(1).get(),
    db.collection("couponcode").where("code", "==", input.code).limit(1).get(),
  ]);
  if (!marketingEmail.empty) throw new HttpsError("already-exists", "This email is already used by a Marketing account.");
  if (!couponConflict.empty) throw new HttpsError("already-exists", "This code is already used as a commission/referral coupon. Choose another Calling Code.");
  const memberRef = db.collection(CALLING_TEAM_COLLECTION).doc();
  const emailRef = db.collection(CALLING_EMAIL_OWNER_COLLECTION).doc(hash(input.email));
  const codeRef = db.collection(CALLING_CODE_OWNER_COLLECTION).doc(input.code);
  await db.runTransaction(async transaction => {
    const [emailMapping, codeMapping] = await Promise.all([transaction.get(emailRef), transaction.get(codeRef)]);
    if (emailMapping.exists) throw new HttpsError("already-exists", "This email is already assigned to a Calling Team member.");
    if (codeMapping.exists) throw new HttpsError("already-exists", "This Calling Code is already in use.");
    transaction.create(memberRef, { ...input, ownerId: owner.id, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(emailRef, { callingMemberId: memberRef.id, ownerId: owner.id, email: input.email, createdAt: FieldValue.serverTimestamp() });
    transaction.create(codeRef, { callingMemberId: memberRef.id, ownerId: owner.id, code: input.code, createdAt: FieldValue.serverTimestamp() });
  });
  return { member: callingMemberPublic(await memberRef.get()) };
});

exports.marketingUpdateCallingMember = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const memberId = String(request.data?.memberId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberId)) throw new HttpsError("invalid-argument", "Invalid Calling Team member ID.");
  const input = validateCallingMemberInput(request.data);
  const memberRef = db.collection(CALLING_TEAM_COLLECTION).doc(memberId);
  const existing = await memberRef.get();
  if (!existing.exists || existing.data().ownerId !== owner.id) throw new HttpsError("permission-denied", "Calling Team member not found.");
  const oldEmail = normalizeEmail(existing.data().email), oldCode = normalizeCallingCode(existing.data().code);
  if (input.email !== oldEmail) {
    const marketingEmail = await db.collection("mteam").where("loginEmail", "==", input.email).limit(1).get();
    if (!marketingEmail.empty) throw new HttpsError("already-exists", "This email is already used by a Marketing account.");
  }
  if (input.code !== oldCode) {
    const couponConflict = await db.collection("couponcode").where("code", "==", input.code).limit(1).get();
    if (!couponConflict.empty) throw new HttpsError("already-exists", "This code is already used as a commission/referral coupon.");
  }
  const newEmailRef = db.collection(CALLING_EMAIL_OWNER_COLLECTION).doc(hash(input.email));
  const newCodeRef = db.collection(CALLING_CODE_OWNER_COLLECTION).doc(input.code);
  await db.runTransaction(async transaction => {
    const [current, emailMapping, codeMapping] = await Promise.all([
      transaction.get(memberRef), transaction.get(newEmailRef), transaction.get(newCodeRef),
    ]);
    if (!current.exists || current.data().ownerId !== owner.id) throw new HttpsError("permission-denied", "Calling Team member not found.");
    if (emailMapping.exists && emailMapping.data().callingMemberId !== memberId) throw new HttpsError("already-exists", "This email is already assigned to another Calling Team member.");
    if (codeMapping.exists && codeMapping.data().callingMemberId !== memberId) throw new HttpsError("already-exists", "This Calling Code is already in use.");
    if (oldEmail && oldEmail !== input.email) transaction.delete(db.collection(CALLING_EMAIL_OWNER_COLLECTION).doc(hash(oldEmail)));
    if (oldCode && oldCode !== input.code) transaction.delete(db.collection(CALLING_CODE_OWNER_COLLECTION).doc(oldCode));
    transaction.set(newEmailRef, { callingMemberId: memberId, ownerId: owner.id, email: input.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(newCodeRef, { callingMemberId: memberId, ownerId: owner.id, code: input.code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(memberRef, { ...input, updatedAt: FieldValue.serverTimestamp() });
  });
  return { member: callingMemberPublic(await memberRef.get()) };
});

exports.marketingSetCallingMemberActive = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const memberId = String(request.data?.memberId || "").trim();
  const active = request.data?.active === true;
  const ref = db.collection(CALLING_TEAM_COLLECTION).doc(memberId), member = await ref.get();
  if (!member.exists || member.data().ownerId !== owner.id) throw new HttpsError("permission-denied", "Calling Team member not found.");
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
  if (!active) {
    const sessions = await db.collection("_panelSessions").where("callingMemberId", "==", memberId).get();
    await Promise.all(sessions.docs.map(document => document.ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(0) })));
  }
  return { ok: true, active };
});

exports.marketingResetCallingMemberPassword = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const memberId = String(request.data?.memberId || "").trim();
  const member = await db.collection(CALLING_TEAM_COLLECTION).doc(memberId).get();
  if (!member.exists || member.data().ownerId !== owner.id) throw new HttpsError("permission-denied", "Calling Team member not found.");
  await db.collection("_panelCredentials").doc(hash(`calling:${memberId}`)).delete().catch(() => null);
  const sessions = await db.collection("_panelSessions").where("callingMemberId", "==", memberId).get();
  await Promise.all(sessions.docs.map(document => document.ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(0) })));
  return { ok: true };
});

exports.marketingGetCallingMemberAnalysis = onCall({ region: REGION, cors: true }, async request => {
  const { owner } = await requireMarketingOwner(request);
  const memberId = String(request.data?.memberId || "").trim();
  const member = await db.collection(CALLING_TEAM_COLLECTION).doc(memberId).get();
  if (!member.exists || member.data().ownerId !== owner.id) throw new HttpsError("permission-denied", "Calling Team member not found.");
  const bundle = await callingLeadsBundle(owner, member);
  return {
    member: callingMemberPublic(member),
    summary: summarizeCallingLeads(bundle.leads),
    leads: bundle.leads,
    totalUsers: bundle.totalUsers,
    truncated: bundle.truncated,
    ownership: { mteamId: owner.id, mainCouponCode: bundle.couponCode, callingCodeCommission: 0 },
  };
});

function appMobileForRequest(request) {
  const uidMatch = String(request.auth?.uid || "").match(/^mobile_(\d{10})$/);
  const candidates = [
    request.auth?.token?.mobileNo,
    request.auth?.token?.mobile,
    request.auth?.token?.phone_number,
    uidMatch?.[1],
  ];
  for (const value of candidates) {
    const mobile = mobile10(value);
    if (/^\d{10}$/.test(mobile)) return mobile;
  }
  return "";
}

async function createCallingReferralClaim({ member, owner, code, mobile }) {
  if (!/^\d{10}$/.test(mobile)) return { claimToken: "", claimExpiresAt: 0 };
  const claimToken = crypto.randomBytes(32).toString("hex");
  const claimExpiresAt = Date.now() + CALLING_REFERRAL_CLAIM_MS;
  await db.collection(CALLING_REFERRAL_CLAIM_COLLECTION).doc(hash(claimToken)).set({
    ownerId: owner.id,
    callingMemberId: member.id,
    callingTeamCode: code,
    mobileHash: hash(mobile),
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(claimExpiresAt),
  });
  return { claimToken, claimExpiresAt };
}

function selectAppUserDocument(snapshot, authUid) {
  if (snapshot.empty) return null;
  const exact = snapshot.docs.find(document => {
    const data = document.data();
    return document.id === authUid ||
      String(data.authUid || "") === authUid ||
      String(data.uid || "") === authUid ||
      String(data.userId || "") === authUid;
  });
  if (exact) return exact;
  return [...snapshot.docs].sort((a, b) =>
    toMillis(b.data().createdAt) - toMillis(a.data().createdAt)
  )[0];
}

exports.resolveCallingTeamCode = onCall({ region: REGION, cors: true }, async request => {
  const code = normalizeCallingCode(request.data?.code);
  if (!/^[A-Z0-9_-]{4,12}$/.test(code)) return { matched: false };
  await rateLimit("calling_code_resolve_ip", ipOf(request), 60, 60 * 1000);
  const mapping = await db.collection(CALLING_CODE_OWNER_COLLECTION).doc(code).get();
  if (!mapping.exists) return { matched: false };
  const member = await db.collection(CALLING_TEAM_COLLECTION).doc(String(mapping.data().callingMemberId || "")).get();
  if (!member.exists || member.data().active !== true || normalizeCallingCode(member.data().code) !== code) return { matched: false };
  const owner = await ownerForId(member.data().ownerId);
  const account = await accountPublic(owner);
  const mainReferCode = account.referCode || account.couponCode;
  if (!mainReferCode || !account.couponCode) {
    throw new HttpsError("failed-precondition", "Main Marketing referral/coupon is not configured.");
  }

  const requestedMobile = mobile10(request.data?.mobile);
  const claim = /^\d{10}$/.test(requestedMobile)
    ? await createCallingReferralClaim({ member, owner, code, mobile: requestedMobile })
    : { claimToken: "", claimExpiresAt: 0 };

  return {
    matched: true,
    type: "calling_team",
    callingTeamId: member.id,
    callingTeamCode: code,
    referredByMteam: owner.id,
    mainReferCode,
    mainCouponCode: account.couponCode,
    commissionEligibleCode: account.couponCode,
    callingCodeCommission: 0,
    ...claim,
  };
});

exports.claimCallingTeamAttribution = onCall({ region: REGION, cors: true }, async request => {
  if (!request.auth || request.auth.token?.panel) {
    throw new HttpsError("unauthenticated", "MLM LIVE user sign in required.");
  }
  const claimToken = String(request.data?.claimToken || "").trim();
  if (!/^[a-f0-9]{64}$/.test(claimToken)) {
    throw new HttpsError("invalid-argument", "Invalid Calling Team claim.");
  }
  await rateLimit("calling_referral_claim", request.auth.uid, 10, 60 * 60 * 1000);

  const claimRef = db.collection(CALLING_REFERRAL_CLAIM_COLLECTION).doc(hash(claimToken));
  const claimSnapshot = await claimRef.get();
  if (!claimSnapshot.exists) throw new HttpsError("deadline-exceeded", "Calling Team claim expired.");
  const claimData = claimSnapshot.data();
  if (claimData.used === true || !claimData.expiresAt || claimData.expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError("deadline-exceeded", "Calling Team claim expired.");
  }

  const mobile = appMobileForRequest(request);
  if (!mobile || hash(mobile) !== claimData.mobileHash) {
    throw new HttpsError("permission-denied", "Calling Team claim does not match this account.");
  }

  const member = await callingMemberForId(claimData.callingMemberId);
  const owner = await ownerForId(claimData.ownerId);
  const code = normalizeCallingCode(claimData.callingTeamCode);
  if (member.data().ownerId !== owner.id || normalizeCallingCode(member.data().code) !== code) {
    throw new HttpsError("permission-denied", "Calling Team claim is no longer valid.");
  }
  const account = await accountPublic(owner);
  const mainReferCode = account.referCode || account.couponCode;
  if (!mainReferCode || !account.couponCode) {
    throw new HttpsError("failed-precondition", "Main Marketing referral/coupon is not configured.");
  }

  const users = await db.collection("users").where("mobileNo", "==", mobile).limit(10).get();
  const userDoc = selectAppUserDocument(users, request.auth.uid);
  if (!userDoc) throw new HttpsError("not-found", "MLM LIVE user record was not found.");

  await db.runTransaction(async transaction => {
    const [freshClaim, freshUser] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userDoc.ref),
    ]);
    if (!freshClaim.exists || freshClaim.data().used === true || !freshClaim.data().expiresAt || freshClaim.data().expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError("deadline-exceeded", "Calling Team claim expired.");
    }
    if (!freshUser.exists || mobile10(freshUser.data().mobileNo) !== mobile) {
      throw new HttpsError("permission-denied", "User record does not match this account.");
    }

    const user = freshUser.data();
    const currentCallingMember = String(user.callingTeamId || "");
    const currentOwner = String(user.referredByMteam || "");
    const currentCoupon = normalizeCallingCode(user.mteamCouponCode || "");
    const currentReferral = normalizeCallingCode(user.referredBy || "");
    const expectedCoupon = normalizeCallingCode(account.couponCode);
    const expectedReferral = normalizeCallingCode(mainReferCode);
    const createdAt = toMillis(user.createdAt);
    const recentSignup = createdAt > 0 && Date.now() - createdAt <= 2 * 60 * 60 * 1000;
    const alreadyOwnedByExpectedMarketing =
      currentOwner === owner.id ||
      currentCoupon === expectedCoupon ||
      currentReferral === expectedReferral;

    if (!alreadyOwnedByExpectedMarketing && !recentSignup) {
      throw new HttpsError("failed-precondition", "Calling Team attribution is only available during signup.");
    }
    if (currentCallingMember && currentCallingMember !== member.id) {
      throw new HttpsError("failed-precondition", "Calling Team attribution is already locked.");
    }
    if (currentOwner && currentOwner !== owner.id) {
      throw new HttpsError("failed-precondition", "Marketing ownership is already assigned to another member.");
    }
    if (currentCoupon && currentCoupon !== expectedCoupon) {
      throw new HttpsError("failed-precondition", "Marketing coupon ownership is already assigned.");
    }
    if (currentReferral && currentReferral !== expectedReferral && currentOwner) {
      throw new HttpsError("failed-precondition", "Referral ownership is already assigned.");
    }

    transaction.update(userDoc.ref, {
      referredByMteam: owner.id,
      referredBy: mainReferCode,
      mteamCouponCode: account.couponCode,
      callingTeamId: member.id,
      callingTeamCode: code,
      callingTeamAttributedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(claimRef, {
      used: true,
      usedAt: FieldValue.serverTimestamp(),
      userId: userDoc.id,
    });
  });

  return {
    matched: true,
    type: "calling_team",
    callingTeamId: member.id,
    callingTeamCode: code,
    referredByMteam: owner.id,
    mainReferCode,
    mainCouponCode: account.couponCode,
    commissionEligibleCode: account.couponCode,
    callingCodeCommission: 0,
  };
});

exports.callingStartTwoFactorOtp = onCall({ region: REGION, cors: true, secrets: [EMAIL_PASS] }, async request => {
  const email = normalizeEmail(request.data?.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new HttpsError("invalid-argument", "Enter a valid registered email.");
  await rateLimit("calling_email_otp_ip", ipOf(request), 8, 10 * 60 * 1000);
  const member = await callingMemberForEmail(email);
  await Promise.all([
    rateLimit("calling_email_otp_cooldown", member.id, 1, 60 * 1000),
    rateLimit("calling_email_otp_member", member.id, 3, 10 * 60 * 1000),
  ]);
  return { challengeId: await createCallingEmailChallenge(member), delivery: "email", maskedEmail: maskEmail(email) };
});

exports.callingVerifyTwoFactorOtp = onCall({ region: REGION, cors: true }, async request => {
  const id = String(request.data?.challengeId || ""), otp = String(request.data?.otp || "");
  if (!/^[a-f0-9]{48}$/.test(id) || !/^\d{6}$/.test(otp)) throw new HttpsError("invalid-argument", "Enter a valid 6-digit OTP.");
  await rateLimit("calling_email_verify_ip", ipOf(request), 20, 10 * 60 * 1000);
  const verified = await verifyCallingChallenge(id, otp);
  const member = await callingMemberForId(verified.callingMemberId);
  const credential = await db.collection("_panelCredentials").doc(hash(`calling:${member.id}`)).get();
  return {
    loginTicket: verified.ticket,
    account: { id: member.id, name: cleanText(member.data().name, 80), code: normalizeCallingCode(member.data().code), passwordConfigured: credential.exists },
  };
});

exports.callingCreateSessionFromTwoFactor = onCall({ region: REGION, cors: true }, async request => {
  const challengeId = String(request.data?.challengeId || ""), ticket = String(request.data?.loginTicket || ""), password = String(request.data?.password || "");
  await rateLimit("calling_password_ip", ipOf(request), 20, 10 * 60 * 1000);
  const { ref: challengeRef, data: verified } = await readCallingTicket(challengeId, ticket);
  const member = await callingMemberForId(verified.callingMemberId);
  const owner = await ownerForId(member.data().ownerId);
  await verifyOrCreateCallingPassword(member.id, password, true);
  await challengeRef.update({ used: true, ticketHash: FieldValue.delete() });
  const claims = {
    panel: "calling",
    actorType: "calling",
    mteamId: owner.id,
    callingMemberId: member.id,
    name: cleanText(member.data().name || "Calling Member", 80),
    mobile: mobile10(member.data().mobile),
    callingCode: normalizeCallingCode(member.data().code),
  };
  const uid = `panel_${hash(`calling:${member.id}:${crypto.randomBytes(24).toString("hex")}`).slice(0, 48)}`;
  const prior = await db.collection("_panelSessions").where("callingMemberId", "==", member.id).get();
  const previous = prior.docs.map(publicSession).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  const now = Timestamp.now(), expiresAt = Timestamp.fromMillis(Date.now() + SESSION_MS);
  await db.collection("_panelSessions").doc(uid).set({
    panel: "calling", ownerId: owner.id, callingMemberId: member.id, actorId: member.id, actorName: claims.name, actorType: "calling",
    ip: ipOf(request), location: locationOf(request), device: deviceOf(request), createdAt: now, lastSeenAt: now, expiresAt, revoked: false,
  });
  return { token: await getAuth().createCustomToken(uid, claims), expiresAt: expiresAt.toMillis(), loginAlert: previous };
});

exports.callingSessionStatus = onCall({ region: REGION, cors: true }, async request => {
  const { ref, data, member, owner } = await callingSessionFor(request);
  await ref.update({ lastSeenAt: FieldValue.serverTimestamp() });
  return {
    valid: true,
    expiresAt: data.expiresAt.toMillis(),
    account: {
      id: member.id,
      mteamId: owner.id,
      name: cleanText(member.data().name, 80),
      mobile: mobile10(member.data().mobile),
      emailMasked: maskEmail(member.data().email),
      callingCode: normalizeCallingCode(member.data().code),
      marketingMemberName: cleanText(owner.data().name, 80),
    },
  };
});

exports.callingUnlockSession = onCall({ region: REGION, cors: true }, async request => {
  const { ref, member } = await callingSessionFor(request);
  await rateLimit("calling_unlock", `${request.auth.uid}:${ipOf(request)}`, 10, 15 * 60 * 1000);
  await verifyOrCreateCallingPassword(member.id, String(request.data?.password || ""), false);
  await ref.update({ lastSeenAt: FieldValue.serverTimestamp(), lastUnlockAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

exports.callingPanelLogout = onCall({ region: REGION, cors: true }, async request => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Not signed in.");
  const target = await db.collection("_panelSessions").doc(request.auth.uid).get();
  if (target.exists && target.data().panel === "calling") await target.ref.delete();
  try { await getAuth().revokeRefreshTokens(request.auth.uid); } catch { /* session document deletion is immediate */ }
  return { ok: true };
});

exports.callingGetDashboard = onCall({ region: REGION, cors: true }, async request => {
  const { member, owner } = await callingSessionFor(request);
  const bundle = await callingLeadsBundle(owner, member);
  return {
    account: {
      name: cleanText(member.data().name, 80),
      code: normalizeCallingCode(member.data().code),
      marketingMemberName: cleanText(owner.data().name, 80),
    },
    summary: summarizeCallingLeads(bundle.leads),
    leads: bundle.leads,
    totalUsers: bundle.totalUsers,
    truncated: bundle.truncated,
    ownership: { mteamId: owner.id, mainCouponCode: bundle.couponCode, callingCodeCommission: 0 },
  };
});

exports.callingSaveFollowup = onCall({ region: REGION, cors: true }, async request => {
  const { member, owner } = await callingSessionFor(request);
  const userId = String(request.data?.userId || "").trim();
  const status = cleanText(request.data?.leadStatus || "Follow Up", 40);
  const note = cleanText(request.data?.note, 500);
  const nextFollowupDate = cleanText(request.data?.nextFollowupDate, 20);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(userId)) throw new HttpsError("invalid-argument", "Invalid user.");
  if (!CALLING_STATUSES.has(status)) throw new HttpsError("invalid-argument", "Invalid lead status.");
  if (!note) throw new HttpsError("invalid-argument", "Follow-up note is required.");
  if (nextFollowupDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowupDate)) throw new HttpsError("invalid-argument", "Invalid next follow-up date.");
  const user = await db.collection("users").doc(userId).get();
  if (!user.exists || String(user.data().referredByMteam || "") !== owner.id || String(user.data().callingTeamId || "") !== member.id) {
    throw new HttpsError("permission-denied", "This lead is not assigned to your Calling Team account.");
  }
  const followupRef = db.collection(CALLING_FOLLOWUP_COLLECTION).doc(hash(`${owner.id}:${userId}`).slice(0, 40));
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(followupRef);
    const existing = snapshot.exists ? snapshot.data() : {};
    const history = Array.isArray(existing.history) ? existing.history.slice(-49) : [];
    history.push({ leadStatus: status, note, nextFollowupDate, addedAt: new Date().toISOString(), addedBy: cleanText(member.data().name, 80), callingMemberId: member.id });
    transaction.set(followupRef, {
      ownerId: owner.id,
      callingMemberId: member.id,
      userId,
      leadStatus: status,
      lastNote: note,
      nextFollowupDate,
      history,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ok: true, leadStatus: status, nextFollowupDate, lastNote: note };
});
