// Users receive and transfer tokens. Token owners are created separately.
export const userNames = ["Alice", "Bob", "Carol"] as const;

// Restrict transfer participants to the configured user names.
interface Transfer {
  from: (typeof userNames)[number];
  to: (typeof userNames)[number];
  amount: string;
}

// Each token gets a separate owner named "<symbol> Owner".
// Decimals define the number of base units per token: 6 means 1 token = 1,000,000 units.
export const tokens = [
  { name: "Test US Dollar", symbol: "tUSD", decimals: 6 },
  { name: "Test Euro", symbol: "tEUR", decimals: 2 },
  { name: "Test Japanese Yen", symbol: "tYEN", decimals: 0 },
];

// Display amounts are strings to avoid floating-point rounding.
// Mint this amount of every token to each user.
export const mintAmount = "1000";

// Native tokens use seven decimals. Execute these transfers in the listed order.
export const nativeTransfers = [
  { from: "Alice", to: "Bob", amount: "1" },
  { from: "Bob", to: "Carol", amount: "0.5" },
  { from: "Carol", to: "Alice", amount: "0.25" },
] satisfies Transfer[];

// Run this sequence for each ERC20 token.
// Amounts must fit every token's decimals; tYEN requires whole tokens.
export const transfers = [
  { from: "Alice", to: "Bob", amount: "125" },
  { from: "Bob", to: "Carol", amount: "40" },
  { from: "Carol", to: "Alice", amount: "10" },
] satisfies Transfer[];
