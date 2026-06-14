import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";

// Get or generate GenLayer local signer account (gasless on studionet)
const getGenLayerAccount = () => {
  let pk = localStorage.getItem("siggy_genlayer_pk");
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem("siggy_genlayer_pk", pk);
  }
  return createAccount(pk as `0x${string}`);
};

export const genLayerAccount = getGenLayerAccount();

export const genLayerClient = createClient({
  chain: studionet,
  account: genLayerAccount,
});

// Default contract address (will be overwritten if we deploy another)
const DEFAULT_CONTRACT_ADDRESS = "0xb18D9EB0EF7f1b3A55C54AB01CAB8a6894b9c5D3"; 

export const getContractAddress = (): `0x${string}` => {
  const stored = localStorage.getItem("siggy_contract_address");
  const oldAddresses = [
    "0xE7Fc6E4f39349AA4267c1F852534cec3e165A83e",
    "0xD1efd161741Cf53BC039f1B0F51e53dBbD3c2F32",
    "0x63e01Cc4dA79C699f6E51397fD2FE62123f311ee"
  ];
  if (stored && oldAddresses.some(addr => addr.toLowerCase() === stored.toLowerCase())) {
    localStorage.removeItem("siggy_contract_address");
    return DEFAULT_CONTRACT_ADDRESS as `0x${string}`;
  }
  return (stored || DEFAULT_CONTRACT_ADDRESS) as `0x${string}`;
};

export const setContractAddress = (address: string) => {
  localStorage.setItem("siggy_contract_address", address);
};

// Generic read helper
export async function readContractHelper(functionName: string, args: any[] = []): Promise<any> {
  const address = getContractAddress();
  try {
    const res = await genLayerClient.readContract({
      address,
      functionName,
      function: functionName, // Defensive key for SDK version variance
      args,
    } as any);
    return res;
  } catch (err: any) {
    console.error(`Error reading ${functionName} from contract ${address}:`, err);
    throw err;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForTransaction(hash: `0x${string}`): Promise<any> {
  let attempts = 0;
  while (attempts < 60) {
    await sleep(3000);
    try {
      const receipt: any = await genLayerClient.getTransactionReceipt({ hash } as any);
      const status = receipt.status;
      const statusName = receipt.statusName || "";
      
      console.log(`Transaction ${hash} status: ${status} (${statusName})`);
      
      if (status === 6 || statusName === "FINALIZED" || status === "success" || status === "SUCCESS") {
        return receipt;
      }
      if (status === 5 || statusName === "FINALIZED_WITH_ERROR" || status === "error" || status === "fail") {
        throw new Error(receipt.error?.message || "Transaction finalized with error");
      }
      
      if (status === 3 || status === 2 || statusName === "COMMITTED" || statusName === "REVEALED") {
        console.log(`Transaction ${hash} ready for finalization. Triggering manual finalize...`);
        try {
          await genLayerClient.finalizeTransaction({ txId: hash } as any);
        } catch (e: any) {
          console.log("Finalize transaction call log:", e.message || e);
        }
      }
    } catch (err: any) {
      console.log("Error querying transaction receipt, waiting...", err.message || err);
    }
    attempts++;
  }
  throw new Error("Transaction finalization timeout");
}

// Generic write helper with wait-for-finalization
export async function writeContractHelper(functionName: string, args: any[] = []): Promise<string> {
  const address = getContractAddress();
  try {
    const hash = await genLayerClient.writeContract({
      address,
      functionName,
      function: functionName, // Defensive key for SDK version variance
      args,
    } as any);
    
    // Wait using our custom self-healing finalize wait loop
    await waitForTransaction(hash);
    
    return hash;
  } catch (err: any) {
    console.error(`Error writing to ${functionName} on contract ${address}:`, err);
    throw err;
  }
}

// Concrete contract actions
export async function submitProposal(
  title: string,
  description: string,
  category: string,
  recipient: string,
  amountMicro: bigint
): Promise<string> {
  return await writeContractHelper("submit_proposal", [
    title,
    description,
    category,
    recipient,
    amountMicro,
  ]);
}

export async function evaluateProposal(pid: number): Promise<string> {
  return await writeContractHelper("evaluate_proposal", [BigInt(pid)]);
}

export async function registerDelegation(
  delegationPayload: string,
  treasuryAddress: string,
  tokenAddress: string,
  executorAddress: string
): Promise<string> {
  return await writeContractHelper("register_delegation", [
    delegationPayload,
    treasuryAddress,
    tokenAddress,
    executorAddress,
  ]);
}

export async function markExecuted(pid: number, txHash: string): Promise<string> {
  return await writeContractHelper("mark_executed", [BigInt(pid), txHash]);
}

export async function getProposal(pid: number): Promise<any> {
  return await readContractHelper("get_proposal", [BigInt(pid)]);
}

export async function getAllProposals(): Promise<any[]> {
  return await readContractHelper("get_all_proposals", []);
}

export async function getContractState(): Promise<any> {
  return await readContractHelper("get_contract_state", []);
}

export async function getExecutionContext(): Promise<any> {
  return await readContractHelper("get_execution_context", []);
}
