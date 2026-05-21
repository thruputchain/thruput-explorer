const CONTRACT_REGISTRY: Record<string, string> = {
  "0xd27a4224e4efa74caf2d424e41399a2e1f809b0f1a5d2e695b17e0b6e8ff2f78": "Ticketmaster",
  "0xc124dae7bb5d0f14b2b9a0768d383f3c5d32185d1e9994d125c9c5b51062dfb8": "Hogmarket",
  "0xa0a9e9c1f83ee6c069307f8c86b75be2b564f9ac66e6b66b385fd6577a100c6c": "Test Token",
};

export function getContractName(address: string) {
  return CONTRACT_REGISTRY[normalizeContractAddress(address)];
}

function normalizeContractAddress(address: string) {
  return address.trim().toLowerCase();
}
