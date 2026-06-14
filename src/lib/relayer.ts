import { encodeFunctionData, parseAbi } from "viem";

export const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || "https://relayer.1shotapi.dev/relayers";

// Standard ERC-20 ABI snippet for transfer
const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// Helper for JSON-RPC requests
export async function rpcCall(method: string, params: any): Promise<any> {
  try {
    const response = await fetch(RELAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result;
  } catch (error: any) {
    console.error(`1Shot RPC Call Error (${method}):`, error);
    throw error;
  }
}

// 1. Get capabilities for Base Sepolia (Chain ID: 84532)
export async function getCapabilities(chainId: string = "84532"): Promise<any> {
  return await rpcCall("relayer_getCapabilities", [chainId]);
}

// 2. Fetch fee data
export async function getFeeData(chainId: string = "84532"): Promise<any> {
  return await rpcCall("relayer_getFeeData", [chainId]);
}

// Encode ERC20 transfer calldata
export function encodeErc20Transfer(recipient: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient as `0x${string}`, amount],
  });
}

// 3. Estimate a 7710 delegated transaction
export async function estimate7710Transaction(
  chainId: string,
  _tokenAddress: string,
  transactions: Array<{ from?: string; to: string; data: string; value: string; permissionContext?: string }>,
  delegation: any
): Promise<{ requiredPaymentAmount: string; gasUsed: string; context: string }> {
  const singleDelegation = Array.isArray(delegation) ? delegation[0] : delegation;
  if (singleDelegation) {
    singleDelegation.signer = singleDelegation.signer || singleDelegation.to;
    singleDelegation.to = singleDelegation.to || singleDelegation.signer;
    singleDelegation.account = singleDelegation.account || singleDelegation.from;
    singleDelegation.from = singleDelegation.from || singleDelegation.account;
    
    // Add Biconomy/EIP-7715 aliases to prevent relayer Address value=null errors
    singleDelegation.delegator = singleDelegation.delegator || singleDelegation.from;
    singleDelegation.delegate = singleDelegation.delegate || singleDelegation.to;
    
    // Add factory address and factoryData fallbacks if missing to satisfy ethers.Address validation
    singleDelegation.factory = singleDelegation.factory || "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c";
    singleDelegation.factoryData = singleDelegation.factoryData || "0x";
    
    if (singleDelegation.permission?.data) {
      singleDelegation.permission.data.token = singleDelegation.permission.data.token || singleDelegation.permission.data.tokenAddress;
      singleDelegation.permission.data.tokenAddress = singleDelegation.permission.data.tokenAddress || singleDelegation.permission.data.token;
    }
  }

  const payload = {
    chainId,
    transactions: [
      {
        permissionContext: [singleDelegation],
        executions: transactions.map(tx => ({
          target: tx.to,
          value: tx.value || "0x0",
          data: tx.data
        }))
      }
    ],
    authorizationList: []
  };

  try {
    return await rpcCall("relayer_estimate7710Transaction", payload);
  } catch (error: any) {
    throw new Error(`relayer_estimate7710Transaction failed: ${error.message || error} (Payload: ${JSON.stringify(payload)})`);
  }
}

// 4. Send a 7710 delegated transaction
export async function send7710Transaction(
  chainId: string,
  _tokenAddress: string,
  transactions: Array<{ from?: string; to: string; data: string; value: string; permissionContext?: string }>,
  delegation: any,
  context: string
): Promise<string> {
  const singleDelegation = Array.isArray(delegation) ? delegation[0] : delegation;
  if (singleDelegation) {
    singleDelegation.signer = singleDelegation.signer || singleDelegation.to;
    singleDelegation.to = singleDelegation.to || singleDelegation.signer;
    singleDelegation.account = singleDelegation.account || singleDelegation.from;
    singleDelegation.from = singleDelegation.from || singleDelegation.account;
    
    // Add Biconomy/EIP-7715 aliases to prevent relayer Address value=null errors
    singleDelegation.delegator = singleDelegation.delegator || singleDelegation.from;
    singleDelegation.delegate = singleDelegation.delegate || singleDelegation.to;
    
    // Add factory address and factoryData fallbacks if missing to satisfy ethers.Address validation
    singleDelegation.factory = singleDelegation.factory || "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c";
    singleDelegation.factoryData = singleDelegation.factoryData || "0x";
    
    if (singleDelegation.permission?.data) {
      singleDelegation.permission.data.token = singleDelegation.permission.data.token || singleDelegation.permission.data.tokenAddress;
      singleDelegation.permission.data.tokenAddress = singleDelegation.permission.data.tokenAddress || singleDelegation.permission.data.token;
    }
  }

  const payload = {
    chainId,
    transactions: [
      {
        permissionContext: [singleDelegation],
        executions: transactions.map(tx => ({
          target: tx.to,
          value: tx.value || "0x0",
          data: tx.data
        }))
      }
    ],
    authorizationList: [],
    context
  };

  try {
    const res = await rpcCall("relayer_send7710Transaction", payload);
    // Returns taskId/transaction id
    return typeof res === "string" ? res : res.result || res.taskId || JSON.stringify(res);
  } catch (error: any) {
    throw new Error(`relayer_send7710Transaction failed: ${error.message || error} (Payload: ${JSON.stringify(payload)})`);
  }
}

// 5. Get status of a task
export async function getStatus(taskId: string): Promise<{ status: string; txHash?: string; error?: string }> {
  const res = await rpcCall("relayer_getStatus", [taskId]);
  return {
    status: res.status || res,
    txHash: res.txHash || res.transactionHash,
    error: res.error,
  };
}

// Polling wrapper for transaction finality
export async function pollTransactionStatus(
  taskId: string,
  intervalMs: number = 2500,
  maxAttempts: number = 30
): Promise<string> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const result = await getStatus(taskId);
    console.log(`Polling task ${taskId}:`, result);
    
    if (result.status === "Confirmed" && result.txHash) {
      return result.txHash;
    }
    if (result.status === "Failed" || result.status === "Rejected" || result.status === "Reverted") {
      throw new Error(`Transaction relay failed with status: ${result.status}. Error: ${result.error || "unknown"}`);
    }
    attempts++;
  }
  throw new Error("Transaction relay timeout");
}
