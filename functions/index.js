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
const ALL_TABS = ["dashboard", "reports", "leads", "freshleads", "taskmanagement", "team", "portalusers", "security"];

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
  const requested = [...new Set((request.data?.mobiles || []).map(mobile10).filter(mobile => /^\d{10}$/.test(mobile)))].slice(0, 100);
  const users = await db.collection("users").where("referredByMteam", "==", owner.id).get();
  const allowed = new Set(users.docs.map(document => mobile10(document.data().mobileNo)));
  const mobiles = requested.filter(mobile => allowed.has(mobile)), profiles = [];
  for (let index = 0; index < mobiles.length; index += 30) {
    const snapshot = await db.collection("mlmprofiles").where("mobile", "in", mobiles.slice(index, index + 30)).get();
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
