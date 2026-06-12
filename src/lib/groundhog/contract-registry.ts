export type ContractRegistryEntry = {
  name: string;
  token?: {
    symbol: string;
    decimals: number;
  };
};

const CONTRACT_REGISTRY: Record<string, ContractRegistryEntry> = {
  "0x0000000000000000000000000000000000000000000000000000000000000001": {
    name: "HOG",
    token: { symbol: "HOG", decimals: 7 },
  },
  "0xd27a4224e4efa74caf2d424e41399a2e1f809b0f1a5d2e695b17e0b6e8ff2f78": {
    name: "Ticketmaster",
  },
  "0xc124dae7bb5d0f14b2b9a0768d383f3c5d32185d1e9994d125c9c5b51062dfb8": {
    name: "Hogmarket",
  },
  "0xfbbd3a47d7ff9a44e3642ce3a04a70b4bd6f9897752ac09a16a8f09e923ffb4c": {
    name: "Test Token",
    token: { symbol: "TEST", decimals: 6 },
  },
};

export function getContractInfo(address: string) {
  return CONTRACT_REGISTRY[normalizeContractAddress(address)];
}

function normalizeContractAddress(address: string) {
  return address.trim().toLowerCase();
}
