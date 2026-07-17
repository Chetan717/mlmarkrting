// All Firestore collection names are loaded from environment variables.
// Set these in your .env file (local) or Vercel / hosting env panel.
// This prevents collection names from being exposed in the public bundle.
export const COLL = {
  MTEAM:        import.meta.env.VITE_COLL_MTEAM        || "mteam",
  COUPONCODE:   import.meta.env.VITE_COLL_COUPONCODE   || "couponcode",
  SUBSCRIPTION: import.meta.env.VITE_COLL_SUBSCRIPTION || "subscription",
  USERS:        import.meta.env.VITE_COLL_USERS        || "users",
  MLMPROFILES:  import.meta.env.VITE_COLL_MLMPROFILES  || "mlmprofiles",
  LEADS:        import.meta.env.VITE_COLL_LEADS        || "leadBysubuserMarketingMember",
  FRESHLEADS:   import.meta.env.VITE_COLL_FRESHLEADS   || "freshleads",
};
