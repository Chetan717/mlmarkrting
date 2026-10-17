export function normalizeCustomerMobile(value) {
  const input = String(value ?? "").trim();
  if (!/^\+?[\d\s()-]+$/.test(input)) return "";
  let digits = input.replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : "";
}

export function matchesCustomerSearch(customer, value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return true;
  if ([customer.name, customer.companyName].some(text => String(text || "").toLowerCase().includes(query))) return true;
  if (!/^\+?[\d\s()-]+$/.test(query)) return false;
  const digits = query.replace(/\D/g, "");
  const mobileQuery = normalizeCustomerMobile(query) || digits;
  return String(customer.mobile || "").replace(/\D/g, "").includes(mobileQuery);
}
