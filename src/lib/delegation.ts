import { toMetaMaskSmartAccount, Implementation } from "@metamask/smart-accounts-kit";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { createPublicClient, createWalletClient, custom, http, keccak256, toBytes } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Base Sepolia USDC Token Address
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Get deterministic Council Executor session account (burner key shared globally)
const getExecutorAccount = () => {
  const pk = keccak256(toBytes("siggy-council-executor-session-key-v1"));
  return privateKeyToAccount(pk);
};

export const executorAccount = getExecutorAccount();

// Get the Hybrid smart account instance for owner
export async function getTreasurySmartAccount(ownerAddress: `0x${string}`, walletClient: any) {
  return await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAddress, [], [], []],
    deploySalt: "0x0000000000000000000000000000000000000000000000000000000000000000",
    signer: { walletClient },
  } as any);
}

// Request ERC-7715 periodic token permission from MetaMask
export async function requestDelegationPermissions(
  treasuryAddress: `0x${string}`,
  limitAmount: bigint
) {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No ethereum provider (MetaMask) found in the browser.");
  }

  // Use treasuryAddress to avoid unused warning
  console.log(`Requesting delegation permissions from treasury smart account: ${treasuryAddress}`);

  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: custom((window as any).ethereum),
  }).extend(erc7715ProviderActions());

  const currentTime = Math.floor(Date.now() / 1000);
  const expiry = currentTime + 60 * 60 * 24 * 365; // 1 year expiration

  const permissions = await walletClient.requestExecutionPermissions([
    {
      chainId: baseSepolia.id,
      expiry,
      to: executorAccount.address,
      permission: {
        type: "erc20-token-periodic",
        isAdjustmentAllowed: false,
        data: {
          tokenAddress: USDC_BASE_SEPOLIA,
          periodAmount: limitAmount,
          periodDuration: 60 * 60 * 24 * 7, // 7 days (seconds)
          startTime: currentTime,
        },
      } as any,
    },
  ]);

  return permissions;
}
