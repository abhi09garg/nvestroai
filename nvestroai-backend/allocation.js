// allocation.js
export function baseAllocation(userProfile = {}) {
  // Accepts: { age, income, riskTolerance } where riskTolerance is "low"|"medium"|"high"
  const age = Number(userProfile.age || 35);
  const risk = (userProfile.riskTolerance || userProfile.risk || "medium").toLowerCase();

  let allocation = {
    stocks: 50,
    bonds: 30,
    etfs: 10,
    crypto: 5,
    cash: 5
  };

  if (risk === "low") {
    allocation = { stocks: 30, bonds: 50, etfs: 10, crypto: 5, cash: 5 };
  } else if (risk === "high") {
    allocation = { stocks: 65, bonds: 15, etfs: 10, crypto: 8, cash: 2 };
  }

  // Age-based adjustments
  if (age >= 55) {
    allocation.stocks = Math.max(5, allocation.stocks - 15);
    allocation.bonds = Math.min(90, allocation.bonds + 10);
    allocation.cash = Math.min(20, allocation.cash + 5);
  } else if (age <= 25) {
    allocation.stocks = Math.min(95, allocation.stocks + 10);
    allocation.cash = Math.max(0, allocation.cash - 5);
  }

  // Normalize to sum 100
  const total = Object.values(allocation).reduce((s, v) => s + v, 0);
  const normalized = {};
  Object.keys(allocation).forEach((k) => {
    normalized[k] = Math.round((allocation[k] / total) * 100);
  });

  // Fix rounding difference so sum === 100
  const diff = 100 - Object.values(normalized).reduce((s, v) => s + v, 0);
  if (diff !== 0) normalized.stocks = normalized.stocks + diff;

  return normalized;
}

// export alias for compatibility
export function getBaseAllocation(user) {
  return baseAllocation(user);
}
