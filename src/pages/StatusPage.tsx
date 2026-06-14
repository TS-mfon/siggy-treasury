import React, { useState, useEffect } from "react";
import { Terminal, Shield, Link2 } from "lucide-react";
import { 
  executorAccount, 
  USDC_BASE_SEPOLIA, 
  getTreasurySmartAccount, 
  requestDelegationPermissions,
  publicClient
} from "../lib/delegation";
import { registerDelegation, getContractAddress, setContractAddress, getExecutionContext } from "../lib/genlayer";
import { erc20Abi } from "viem";
import { getCapabilities } from "../lib/relayer";

interface StatusPageProps {
  ownerAddress: string;
  connectWallet: () => Promise<void>;
  walletClient: any;
  isConfigured: boolean;
  setIsConfigured: (val: boolean) => void;
  treasuryAddress: string;
  setTreasuryAddress: (addr: string) => void;
}

export const StatusPage: React.FC<StatusPageProps> = ({
  ownerAddress,
  connectWallet,
  walletClient,
  isConfigured,
  setIsConfigured,
  treasuryAddress,
  setTreasuryAddress,
}) => {
  const [contractAddrInput, setContractAddrInput] = useState(getContractAddress());
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [ethBalance, setEthBalance] = useState("0");
  const [logs, setLogs] = useState<string[]>([
    "SIGGY_OS [v1.0.0] Initializing status console...",
    `[INFO] Council Executor burner key: ${executorAccount.address}`,
  ]);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const updateBalances = async (smartAccountAddr: string) => {
    if (!smartAccountAddr || smartAccountAddr === "0x") return;
    try {
      // Fetch ETH balance
      const ethVal = await publicClient.getBalance({ address: smartAccountAddr as `0x${string}` });
      setEthBalance((Number(ethVal) / 1e18).toFixed(4));

      // Fetch USDC balance
      const usdcVal = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [smartAccountAddr as `0x${string}`],
      }) as bigint;
      setUsdcBalance((Number(usdcVal) / 1e6).toFixed(2));
    } catch (e: any) {
      console.error("Error updating balances:", e);
      addLog(`[WARN] Failed to fetch balances: ${e.message || e}`);
    }
  };

  useEffect(() => {
    if (ownerAddress && walletClient) {
      // Calculate counterfactual treasury address
      getTreasurySmartAccount(ownerAddress as `0x${string}`, walletClient)
        .then((account) => {
          setTreasuryAddress(account.address);
          addLog(`[INFO] Calculated counterfactual Treasury address: ${account.address}`);
          updateBalances(account.address);
        })
        .catch((e) => {
          addLog(`[ERROR] Failed to load Smart Account: ${e.message}`);
        });
    }
  }, [ownerAddress, walletClient]);

  // Read config from GenLayer to verify if registered
  useEffect(() => {
    getExecutionContext()
      .then((ctx) => {
        if (ctx && ctx.treasury_address && ctx.delegation_payload) {
          setIsConfigured(true);
          setTreasuryAddress(ctx.treasury_address);
          addLog(`[INFO] Active delegation registered on GenLayer for treasury: ${ctx.treasury_address}`);
        } else {
          setIsConfigured(false);
          addLog("[WARN] No delegation payload found on GenLayer contract.");
        }
      })
      .catch((e) => {
        addLog(`[WARN] Could not retrieve contract context: ${e.message || e}`);
      });
  }, [contractAddrInput]);

  const handleUpdateContractAddr = () => {
    setContractAddress(contractAddrInput);
    addLog(`[INFO] Contract address updated to: ${contractAddrInput}`);
    window.location.reload();
  };

  const handleSetupTreasuryAndDelegation = async () => {
    if (!ownerAddress || !walletClient) {
      addLog("[ERROR] Admin wallet not connected. Cannot request permissions.");
      return;
    }
    setIsSettingUp(true);
    addLog("[START] Initiating treasury authorization sequence...");

    try {
      // 1. Get Smart Account
      addLog("[STEP 1] Generating counterfactual Treasury Smart Account...");
      const treasuryAccount = await getTreasurySmartAccount(ownerAddress as `0x${string}`, walletClient);
      setTreasuryAddress(treasuryAccount.address);
      addLog(`[SUCCESS] Treasury account target address: ${treasuryAccount.address}`);

      // 2. Discover Relayer capabilities & target fee address
      addLog("[STEP 2] Discovering 1Shot Relayer capabilities...");
      let targetAddress = "0xf1ef956eff4181Ce913b664713515996858B9Ca9"; // default fallback
      try {
        const capabilities = await getCapabilities("84532");
        targetAddress = capabilities?.targetAddress || capabilities?.["84532"]?.targetAddress || targetAddress;
        addLog(`[INFO] Relayer target fee address discovered: ${targetAddress}`);
      } catch (e: any) {
        addLog(`[WARN] Could not fetch dynamic capabilities, using fallback relayer target address: ${targetAddress}`);
      }

      // 3. Request ERC-7715 permissions from MetaMask (500 USDC weekly)
      addLog("[STEP 3] Launching MetaMask ERC-7715 Request Execution Permissions dialog...");
      addLog(`[INFO] Requesting 500 USDC periodic weekly limit for Relayer Target Wallet (${targetAddress})...`);
      
      const limitAmount = 500n * 10n**6n; // 500 USDC
      const permissions = await requestDelegationPermissions(
        treasuryAccount.address,
        limitAmount,
        targetAddress
      );
      
      addLog("[SUCCESS] MetaMask signature retrieved for execution permissions!");
      
      // Query factory arguments to handle smart account deployment if counterfactual
      addLog("[INFO] Querying smart account deployment factory parameters...");
      const factoryArgs = await (treasuryAccount as any).getFactoryArgs();
      
      const enrichedPermissions = permissions.map((p: any) => ({
        ...p,
        factory: factoryArgs.factory,
        factoryData: factoryArgs.factoryData
      }));

      const serializedPayload = JSON.stringify(enrichedPermissions, (_, v) => typeof v === "bigint" ? v.toString() : v);
      addLog(`[INFO] Permission Payload serialized: ${serializedPayload.slice(0, 100)}...`);

      // 4. Register on GenLayer Contract
      addLog("[STEP 4] Registering permission delegation to GenLayer Studionet contract...");
      addLog("[INFO] Writing payload, treasury address, USDC address, and session signer address...");
      
      const glTxHash = await registerDelegation(
        serializedPayload,
        treasuryAccount.address,
        USDC_BASE_SEPOLIA,
        executorAccount.address
      );
      
      addLog(`[SUCCESS] Registered delegation on GenLayer! Tx Hash: ${glTxHash}`);
      setIsConfigured(true);
      addLog("[COMPLETE] Treasury setup finalized. Siggy OS is now fully operational!");
      
      await updateBalances(treasuryAccount.address);
    } catch (e: any) {
      console.error(e);
      addLog(`[FATAL ERROR] Setup failed: ${e.message || JSON.stringify(e)}`);
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="status-page">
      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Shield size={14} /> SECURITY_STATUS_PANEL.CONFIG
          </span>
        </div>
        <div className="window-body">
          <div className="grid-2">
            <div>
              <h2 style={{ fontSize: "16px", marginBottom: "15px", textShadow: "0 0 5px var(--matrix-green)" }}>
                DAO TREASURY SYSTEM STATE
              </h2>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--system-gray)" }}>SYSTEM INITIALIZED:</span>
                  <span className={isConfigured ? "status-ok" : "status-warn"}>
                    {isConfigured ? "ACTIVE (SYSTEM_STABLE)" : "PENDING_SETUP"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--system-gray)" }}>ADMIN EOA KEY:</span>
                  <span>
                    {ownerAddress ? `${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}` : (
                      <button onClick={connectWallet} className="btn" style={{ padding: "2px 8px", fontSize: "10px" }}>
                        CONNECT
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--system-gray)" }}>TREASURY SMART ACCOUNT:</span>
                  <span>
                    {treasuryAddress ? (
                      <a 
                        href={`https://sepolia.basescan.org/address/${treasuryAddress}`} 
                        target="_blank" 
                        rel="noreferrer"
                      >
                        {treasuryAddress.slice(0, 8)}...{treasuryAddress.slice(-6)}
                      </a>
                    ) : "NOT CALCULATED"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--system-gray)" }}>COUNCIL EXECUTOR KEY:</span>
                  <span style={{ color: "var(--matrix-green)" }}>
                    {executorAccount.address.slice(0, 8)}...{executorAccount.address.slice(-6)}
                  </span>
                </div>
              </div>

              {!isConfigured ? (
                <div style={{ padding: "15px", border: "1px solid var(--cyber-magenta)", background: "rgba(255, 0, 127, 0.05)", borderRadius: "4px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", color: "var(--cyber-magenta)", marginBottom: "8px" }}>
                    <Shield size={14} /> ADMINISTRATIVE DELEGATION REQUIRED
                  </div>
                  <p style={{ fontSize: "11px", color: "#ccc", marginBottom: "15px" }}>
                    To enable gasless payouts, the DAO owner must initialize the Treasury Smart Account and delegate periodic USDC permissions to the Council Executor.
                  </p>
                  <button 
                    onClick={handleSetupTreasuryAndDelegation} 
                    className="btn btn-magenta" 
                    style={{ width: "100%" }}
                    disabled={!ownerAddress || isSettingUp}
                  >
                    {isSettingUp ? "EXECUTING SETUP..." : "GRANT DELEGATION (ERC-7715)"}
                  </button>
                  {!ownerAddress && (
                    <p style={{ fontSize: "10px", color: "var(--cyber-magenta)", marginTop: "6px", textAlign: "center" }}>
                      *Connect MetaMask admin wallet first
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ padding: "15px", border: "1px solid var(--matrix-green)", background: "rgba(0, 255, 65, 0.03)", borderRadius: "4px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", color: "var(--matrix-green)", marginBottom: "8px" }}>
                    <Shield size={14} /> DELEGATION SYSTEM ACTIVE [OK]
                  </div>
                  <p style={{ fontSize: "11px", color: "#ccc" }}>
                    The council executor burner wallet is successfully authorized. 1Shot Relayer is primed to execute approved payouts gaslessly on behalf of the smart account.
                  </p>
                  <button 
                    onClick={handleSetupTreasuryAndDelegation} 
                    className="btn" 
                    style={{ width: "100%", marginTop: "15px", padding: "6px 12px", fontSize: "11px" }}
                    disabled={isSettingUp}
                  >
                    RE-NEW/ADJUST DELEGATION
                  </button>
                </div>
              )}
            </div>

            <div>
              <h2 style={{ fontSize: "16px", marginBottom: "15px", textShadow: "0 0 5px var(--matrix-green)" }}>
                SMART ACCOUNT BALANCES
              </h2>
              
              <div className="grid-2" style={{ marginBottom: "24px" }}>
                <div className="stat-box glowing">
                  <div className="stat-label">TREASURY USDC</div>
                  <div className="stat-value">{usdcBalance} <span style={{ fontSize: "11px" }}>USDC</span></div>
                  <div style={{ fontSize: "10px", color: "var(--system-gray)", marginTop: "6px" }}>
                    Token: {USDC_BASE_SEPOLIA.slice(0, 6)}...{USDC_BASE_SEPOLIA.slice(-4)}
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-label">TREASURY ETH</div>
                  <div className="stat-value">{ethBalance} <span style={{ fontSize: "11px" }}>ETH</span></div>
                  <div style={{ fontSize: "10px", color: "var(--system-gray)", marginTop: "6px" }}>
                    Network: Base Sepolia Testnet
                  </div>
                </div>
              </div>

              <div style={{ padding: "15px", border: "1px solid #333", borderRadius: "4px" }}>
                <h3 style={{ fontSize: "12px", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Link2 size={12} /> GENLAYER CONTRACT BINDINGS
                </h3>
                <div className="form-group" style={{ marginBottom: "10px" }}>
                  <label className="form-label" style={{ fontSize: "10px" }}>Active Contract Address (Studionet)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={contractAddrInput}
                    onChange={(e) => setContractAddrInput(e.target.value as `0x${string}`)}
                    style={{ fontSize: "11px", fontFamily: "monospace" }}
                  />
                </div>
                <button 
                  onClick={handleUpdateContractAddr} 
                  className="btn" 
                  style={{ width: "100%", padding: "6px 12px", fontSize: "11px" }}
                >
                  SAVE & BIND CONTRACT
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Terminal size={14} /> LIVE_SETUP_CONSOLE_LOG.LOG
          </span>
        </div>
        <div className="window-body" style={{ padding: "0" }}>
          <div className="code-screen" style={{ maxHeight: "250px", height: "200px", borderRadius: "0", border: "none" }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: "4px", color: log.includes("[SUCCESS]") ? "var(--matrix-green)" : log.includes("[ERROR]") || log.includes("[FATAL") ? "var(--cyber-magenta)" : "#aaa" }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
