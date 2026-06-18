export const VAULT_ABI = [
  "function deposit(bytes32 commitment) payable",
  "function token() view returns (address)",
  "function denomination() view returns (uint256)",
  "function latestRoot() view returns (bytes32)",
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
];

export const POOL_ABI = [
  "function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, address relayer, uint256 fee, uint256 refund)",
  "function nullifierSpent(bytes32) view returns (bool)",
  "function denomination() view returns (uint256)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
