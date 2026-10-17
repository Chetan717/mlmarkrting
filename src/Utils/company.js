const text = value => typeof value === "string" ? value.trim() : "";

export function companyNameFrom(data) {
  if (!data || typeof data !== "object") return "";
  return [data.companyName, data.company_name, data.CompanyName,
    data.company?.name, data.company?.companyName, data.company, data.mlmCompanyName]
    .map(text).find(Boolean) || "";
}

export function companyForLead(user, profile, subscription) {
  return companyNameFrom(profile) || companyNameFrom(subscription) || companyNameFrom(user);
}

export function preferredProfile(previous, candidate) {
  if (!previous) return candidate;
  const named = Number(Boolean(companyNameFrom(candidate))) - Number(Boolean(companyNameFrom(previous)));
  if (named) return named > 0 ? candidate : previous;
  const time = profile => {
    const value = profile.updatedAt || profile.createdAt;
    return value?.toMillis?.() || value?.seconds * 1000 || Date.parse(value) || 0;
  };
  return time(candidate) > time(previous) ? candidate : previous;
}
