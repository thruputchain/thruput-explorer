export type ContractRegistryEntry = {
  name: string;
  standard?: "groundhog-token-v1" | "groundhog-native-hog";
  symbol?: string;
  decimals?: number;
};

const CONTRACT_REGISTRY: Record<string, ContractRegistryEntry> = {
  "0x0000000000000000000000000000000000000000000000000000000000000001": {
    name: "HOG",
    standard: "groundhog-native-hog",
    symbol: "HOG",
    decimals: 7,
  },
  "0xd27a4224e4efa74caf2d424e41399a2e1f809b0f1a5d2e695b17e0b6e8ff2f78": {
    name: "Ticketmaster",
  },
  "0xc124dae7bb5d0f14b2b9a0768d383f3c5d32185d1e9994d125c9c5b51062dfb8": {
    name: "Hogmarket",
  },
  "0x21798f9f0052dd119911de3e6f8c08be4f5552cb0ca5a7daf747a6b9fba39b06": {
    name: "Test Token",
    standard: "groundhog-token-v1",
    symbol: "TEST",
    decimals: 6,
  },
};

export function getContractName(address: string) {
  return getContractInfo(address)?.name;
}

export function getContractInfo(address: string) {
  return CONTRACT_REGISTRY[normalizeContractAddress(address)];
}

function normalizeContractAddress(address: string) {
  return address.trim().toLowerCase();
}
