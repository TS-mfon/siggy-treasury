import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Terminal, Play, CheckCircle, Loader, Shield, ExternalLink, RefreshCw } from "lucide-react";
import { 
  evaluateProposal, 
  getAllProposals, 
  markExecuted,
  getExecutionContext,
  getProposal
} from "../lib/genlayer";
import { 
  getCapabilities, 
  estimate7710Transaction, 
  send7710Transaction, 
  pollTransactionStatus, 
  encodeErc20Transfer
} from "../lib/relayer";
import { USDC_BASE_SEPOLIA } from "../lib/delegation";

interface Proposal {
  id: number;
  proposer: string;
  title: string;
  description: string;
  category: string;
  recipient: string;
  requested_amount_micro: bigint | string;
  status: string;
  approved_amount_micro: bigint | string;
  final_reasoning: string;
  created_at: string;
  tx_hash: string;
  verdicts?: Array<{
    persona: string;
    vote: string;
    confidence: number;
    max_amount_micro: bigint | string;
    reasoning: string;
  }>;
}

export const EvaluationPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [executingPids, setExecutingPids] = useState<Set<number>>(new Set());
  const [logs, setLogs] = useState<string[]>(["SIGGY_OS [v1.0.0] Council chamber initialized."]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const list = await getAllProposals();
      const formatted = list.map((p: any) => ({
        id: Number(p.id),
        proposer: p.proposer,
        title: p.title,
        description: p.description,
        category: p.category,
        recipient: p.recipient,
        requested_amount_micro: p.requested_amount_micro,
        status: p.status,
        approved_amount_micro: p.approved_amount_micro,
        final_reasoning: p.final_reasoning,
        created_at: p.created_at,
        tx_hash: p.tx_hash,
        verdicts: p.verdicts
      }));
      setProposals(formatted);
    } catch (e: any) {
      addLog(`[WARN] Failed to load proposals: ${e.message || e}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  // Handle auto-focus from query param ?pid=X
  useEffect(() => {
    const urlPid = searchParams.get("pid");
    if (urlPid !== null && proposals.length > 0) {
      const pidNum = Number(urlPid);
      if (proposals.some(p => p.id === pidNum)) {
        setSelectedPid(pidNum);
        addLog(`[INFO] Auto-focused proposal ID: ${pidNum}`);
      }
    }
  }, [searchParams, proposals]);

  const handleRunCouncil = async (pid: number) => {
    setActionLoading(`council-${pid}`);
    addLog(`[START] Triggering GenLayer AI Council evaluation for Proposal ID: ${pid}...`);
    addLog("[INFO] Invoking The Skeptic, The Strategist, and The Ethicist on Studionet...");
    try {
      await evaluateProposal(pid);
      addLog(`[SUCCESS] AI Council has finalized consensus. Waiting for RPC state synchronization...`);
      
      // Poll for contract state update (sync delay on view endpoints)
      let formatted: Proposal[] = [];
      let updatedProp: Proposal | undefined = undefined;
      
      for (let attempts = 1; attempts <= 15; attempts++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const list = await getAllProposals();
        formatted = list.map((p: any) => ({
          id: Number(p.id),
          proposer: p.proposer,
          title: p.title,
          description: p.description,
          category: p.category,
          recipient: p.recipient,
          requested_amount_micro: p.requested_amount_micro,
          status: p.status,
          approved_amount_micro: p.approved_amount_micro,
          final_reasoning: p.final_reasoning,
          created_at: p.created_at,
          tx_hash: p.tx_hash,
          verdicts: p.verdicts
        }));
        
        updatedProp = formatted.find((p) => p.id === pid);
        if (updatedProp && updatedProp.status !== "pending") {
          addLog(`[SUCCESS] RPC state synchronized on attempt ${attempts}.`);
          break;
        }
        addLog(`[INFO] Syncing block state (attempt ${attempts}/15)...`);
      }
      
      setProposals(formatted);

      if (updatedProp) {
        if (updatedProp.status === "approved") {
          addLog(`[AUTO-DEMOCRACY] Proposal approved on GenLayer! Automatically executing payout...`);
          await handleExecutePayout(updatedProp);
        } else {
          addLog(`[INFO] Proposal evaluated. Result: REJECTED. Reasoning: ${updatedProp.final_reasoning}`);
        }
      } else {
        addLog(`[WARN] Proposal ID ${pid} not found after sync loop.`);
      }
    } catch (err: any) {
      addLog(`[ERROR] Council evaluation failed: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecutePayout = async (proposal: Proposal) => {
    if (executingPids.has(proposal.id)) {
      addLog(`[WARN] Payout execution for Proposal ID ${proposal.id} is already in progress.`);
      return;
    }

    setExecutingPids(prev => {
      const next = new Set(prev);
      next.add(proposal.id);
      return next;
    });
    setActionLoading(`execute-${proposal.id}`);
    addLog(`[START] Commencing gasless payout for Proposal ID: ${proposal.id}...`);

    try {
      // 0. Double-check status directly from GenLayer contract before execution
      addLog("[STEP 0] Double-checking proposal status onchain...");
      const latestProposal = await getProposal(proposal.id);
      if (latestProposal.status === "executed") {
        throw new Error("This proposal has already been executed.");
      }
      if (latestProposal.status !== "approved") {
        throw new Error(`Proposal is in '${latestProposal.status}' status, expected 'approved'.`);
      }
      addLog("[SUCCESS] Proposal status verified as APPROVED.");

      // 1. Get execution context from GenLayer
      addLog("[STEP 1] Fetching authorized permission delegation from GenLayer...");
      const execContext = await getExecutionContext();
      if (!execContext.delegation_payload) {
        throw new Error("No delegation payload registered on the GenLayer contract. Setup required in Admin Panel.");
      }
      
      const signedDelegationBundle = JSON.parse(execContext.delegation_payload);
      const permissionContext = signedDelegationBundle[0]?.context || signedDelegationBundle.context;
      if (!permissionContext) {
        throw new Error("No permissionContext found in the delegation payload.");
      }
      const smartAccountAddress = signedDelegationBundle[0]?.from || signedDelegationBundle.from || execContext.treasury_address;
      addLog("[SUCCESS] Authorized delegation payload and context retrieved.");

      // 2. Discover Relayer capabilities & target fee address
      addLog("[STEP 2] Discovering 1Shot Relayer capabilities...");
      const capabilities = await getCapabilities("84532");
      const targetFeeAddress = capabilities?.targetAddress || capabilities?.["84532"]?.targetAddress || "0xe696417A6129F29E04E586c071d07c089E2CE2DE";
      addLog(`[INFO] Relayer target fee address: ${targetFeeAddress}`);

      // 3. Assemble Payout Work Transaction
      addLog("[STEP 3] Assembling work transaction...");
      const amountMicro = BigInt(proposal.approved_amount_micro.toString());
      const workCalldata = encodeErc20Transfer(proposal.recipient, amountMicro);
      const workTx = {
        from: smartAccountAddress,
        to: USDC_BASE_SEPOLIA,
        data: workCalldata,
        value: "0x0",
        permissionContext
      };

      // 4. Estimate gas fee against relayer (First pass)
      addLog("[STEP 4] Estimating gas payment requirement (First Pass)...");
      const initialEstimate = await estimate7710Transaction(
        "84532",
        USDC_BASE_SEPOLIA,
        [workTx],
        signedDelegationBundle
      );
      
      if (!initialEstimate) {
        throw new Error("1Shot Relayer returned empty estimation response.");
      }
      if ((initialEstimate as any).error) {
        throw new Error(`1Shot Relayer estimation failed: ${(initialEstimate as any).error}. Inputs: workTx=${JSON.stringify(workTx)}, smartAccountAddress=${smartAccountAddress}, permissionContext=${permissionContext}, signedDelegationBundle=${JSON.stringify(signedDelegationBundle)}`);
      }
      if (!initialEstimate.requiredPaymentAmount) {
        throw new Error(`1Shot Relayer estimation failed: requiredPaymentAmount is undefined. Full response: ${JSON.stringify(initialEstimate)}`);
      }
      
      const feeAmount = BigInt(initialEstimate.requiredPaymentAmount);
      addLog(`[INFO] Relayer fee required: ${Number(feeAmount) / 1e6} USDC`);

      // 5. Build Fee Transaction & bundle
      addLog("[STEP 5] Encoding fee payment and compiling final transaction bundle...");
      const feeCalldata = encodeErc20Transfer(targetFeeAddress, feeAmount);
      const feeTx = {
        from: smartAccountAddress,
        to: USDC_BASE_SEPOLIA,
        data: feeCalldata,
        value: "0x0",
        permissionContext
      };

      const fullTransactions = [feeTx, workTx];

      // 6. Final Estimate to secure context signature
      addLog("[STEP 6] Securing quote context signature from relayer...");
      const finalEstimate = await estimate7710Transaction(
        "84532",
        USDC_BASE_SEPOLIA,
        fullTransactions,
        signedDelegationBundle
      );

      if (!finalEstimate) {
        throw new Error("1Shot Relayer returned empty final estimation response.");
      }
      if ((finalEstimate as any).error) {
        throw new Error(`1Shot Relayer final estimation failed: ${(finalEstimate as any).error}`);
      }
      if (!finalEstimate.context) {
        throw new Error(`1Shot Relayer final estimation failed: context signature is undefined. Full response: ${JSON.stringify(finalEstimate)}`);
      }

      // 7. Submit transaction to 1Shot
      addLog("[STEP 7] Dispatching bundle to 1Shot Relayer for execution...");
      const taskId = await send7710Transaction(
        "84532",
        USDC_BASE_SEPOLIA,
        fullTransactions,
        signedDelegationBundle,
        finalEstimate.context
      );
      addLog(`[SUCCESS] Relayer task generated. Task ID: ${taskId}`);

      // 8. Poll for confirmation
      addLog("[STEP 8] Polling 1Shot relayer status...");
      const txHash = await pollTransactionStatus(taskId);
      addLog(`[SUCCESS] Transaction confirmed on Base Sepolia! Hash: ${txHash}`);

      // 9. Mark executed on GenLayer
      addLog("[STEP 9] Updating final execution status on GenLayer contract...");
      const glMarkHash = await markExecuted(proposal.id, txHash);
      addLog(`[SUCCESS] GenLayer status updated! Tx: ${glMarkHash}`);
      
      addLog("[COMPLETE] Payout completed gaslessly!");
      await fetchProposals();
    } catch (e: any) {
      console.error(e);
      addLog(`[FATAL ERROR] Payout execution failed: ${e.message || JSON.stringify(e)}`);
    } finally {
      setExecutingPids(prev => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
      setActionLoading(null);
    }
  };

  const activeProposals = proposals.filter(p => p.status === "pending" || p.status === "approved");
  const selectedProposal = proposals.find(p => p.id === selectedPid);

  return (
    <div className="evaluation-page">
      <div className="grid-3" style={{ gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
        
        {/* Left Side: Pending Queue */}
        <div className="terminal-window" style={{ minHeight: "450px" }}>
          <div className="window-header">
            <span className="window-title">
              <Terminal size={14} /> ACTIVE_EVALUATION_QUEUE.LST
            </span>
            <button onClick={fetchProposals} className="btn-refresh" style={{ background: "none", border: "none", color: "var(--matrix-green)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="window-body" style={{ overflowY: "auto", maxHeight: "500px" }}>
            {isLoading && proposals.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Loader className="animate-spin" size={16} /> Loading active queue...
              </div>
            ) : activeProposals.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--system-gray)" }}>
                [NO PENDING EVALUATIONS IN QUEUE]
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {activeProposals.map((p) => {
                  const reqAmt = Number(p.requested_amount_micro) / 1e6;
                  const isSelected = selectedPid === p.id;
                  return (
                    <div 
                      key={p.id}
                      onClick={() => {
                        setSelectedPid(p.id);
                        setSearchParams({ pid: String(p.id) });
                      }}
                      style={{
                        padding: "12px",
                        border: isSelected ? "1px solid var(--matrix-green)" : "1px solid #222",
                        background: isSelected ? "rgba(0, 255, 65, 0.05)" : "#0c0c0c",
                        cursor: "pointer",
                        borderRadius: "4px",
                        boxShadow: isSelected ? "0 0 8px var(--matrix-glow)" : "none"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--system-gray)", marginBottom: "4px" }}>
                        <span>PID #{p.id}</span>
                        <span>{p.category.toUpperCase()}</span>
                      </div>
                      <div style={{ fontWeight: "bold", color: isSelected ? "#fff" : "var(--matrix-green)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.title}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "bold" }}>{reqAmt} USDC</span>
                        <span className={`badge badge-${p.status}`} style={{ fontSize: "9px", padding: "2px 6px" }}>
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Chamber Workplace */}
        <div className="terminal-window" style={{ minHeight: "450px" }}>
          <div className="window-header">
            <span className="window-title">
              <Shield size={14} /> COUNCIL_CHAMBER_CONSOLE.EXE
            </span>
          </div>
          <div className="window-body" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
            
            {selectedProposal ? (
              <div>
                {/* Proposal Info Header */}
                <div style={{ borderBottom: "1px solid #222", paddingBottom: "15px", marginBottom: "15px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--system-gray)" }}>
                        PROPOSER: <code>{selectedProposal.proposer}</code>
                      </span>
                      <h2 style={{ fontSize: "18px", marginTop: "4px", textShadow: "0 0 5px var(--matrix-green)" }}>
                        {selectedProposal.title}
                      </h2>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                        {Number(selectedProposal.requested_amount_micro) / 1e6} USDC
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--system-gray)" }}>Requested</div>
                    </div>
                  </div>

                  <p style={{ marginTop: "12px", color: "#ccc", fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.5", background: "#050505", padding: "10px", border: "1px solid #222", borderRadius: "4px" }}>
                    <strong>Strategic Rationale:</strong><br />
                    {selectedProposal.description}
                  </p>
                  
                  <div style={{ marginTop: "10px", fontSize: "11px", display: "flex", gap: "20px" }}>
                    <span>Category: <strong>{selectedProposal.category.toUpperCase()}</strong></span>
                    <span>Recipient: <code style={{ color: "var(--matrix-green)" }}>{selectedProposal.recipient}</code></span>
                  </div>
                </div>

                {/* AI Personas Panel */}
                <div>
                  <h3 style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--system-gray)", marginBottom: "12px", letterSpacing: "1px" }}>
                    Intelligent Council Consensus Status
                  </h3>
                  
                  <div className="grid-3" style={{ gap: "12px", marginBottom: "20px" }}>
                    
                    {/* Persona 1: Skeptic */}
                    <div className={`persona-card ${selectedProposal.status === "pending" ? "pending" : (selectedProposal.verdicts?.[0]?.vote === "approve" ? "approve" : "reject")}`} style={{ opacity: selectedProposal.status === "pending" ? 0.6 : 1 }}>
                      <div className="persona-name" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>THE SKEPTIC</span>
                        {selectedProposal.status !== "pending" && (
                          <span style={{ fontWeight: "bold" }}>
                            {selectedProposal.verdicts?.[0]?.vote.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {selectedProposal.status === "pending" ? (
                        <div style={{ fontSize: "10px", color: "#666", padding: "20px 0", textAlign: "center" }}>
                          [AWAITING EVALUATION]
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: "9px", color: "#666", marginBottom: "6px" }}>
                            Conf: {selectedProposal.verdicts?.[0]?.confidence}% | Cap: {Number(selectedProposal.verdicts?.[0]?.max_amount_micro) / 1e6} USDC
                          </div>
                          <p className="persona-reasoning" style={{ fontSize: "10px", lineHeight: "1.3" }}>
                            "{selectedProposal.verdicts?.[0]?.reasoning}"
                          </p>
                        </>
                      )}
                    </div>

                    {/* Persona 2: Strategist */}
                    <div className={`persona-card ${selectedProposal.status === "pending" ? "pending" : (selectedProposal.verdicts?.[1]?.vote === "approve" ? "approve" : "reject")}`} style={{ opacity: selectedProposal.status === "pending" ? 0.6 : 1 }}>
                      <div className="persona-name" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>THE STRATEGIST</span>
                        {selectedProposal.status !== "pending" && (
                          <span style={{ fontWeight: "bold" }}>
                            {selectedProposal.verdicts?.[1]?.vote.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {selectedProposal.status === "pending" ? (
                        <div style={{ fontSize: "10px", color: "#666", padding: "20px 0", textAlign: "center" }}>
                          [AWAITING EVALUATION]
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: "9px", color: "#666", marginBottom: "6px" }}>
                            Conf: {selectedProposal.verdicts?.[1]?.confidence}% | Cap: {Number(selectedProposal.verdicts?.[1]?.max_amount_micro) / 1e6} USDC
                          </div>
                          <p className="persona-reasoning" style={{ fontSize: "10px", lineHeight: "1.3" }}>
                            "{selectedProposal.verdicts?.[1]?.reasoning}"
                          </p>
                        </>
                      )}
                    </div>

                    {/* Persona 3: Ethicist */}
                    <div className={`persona-card ${selectedProposal.status === "pending" ? "pending" : (selectedProposal.verdicts?.[2]?.vote === "approve" ? "approve" : "reject")}`} style={{ opacity: selectedProposal.status === "pending" ? 0.6 : 1 }}>
                      <div className="persona-name" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>THE ETHICIST</span>
                        {selectedProposal.status !== "pending" && (
                          <span style={{ fontWeight: "bold" }}>
                            {selectedProposal.verdicts?.[2]?.vote.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {selectedProposal.status === "pending" ? (
                        <div style={{ fontSize: "10px", color: "#666", padding: "20px 0", textAlign: "center" }}>
                          [AWAITING EVALUATION]
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: "9px", color: "#666", marginBottom: "6px" }}>
                            Conf: {selectedProposal.verdicts?.[2]?.confidence}% | Cap: {Number(selectedProposal.verdicts?.[2]?.max_amount_micro) / 1e6} USDC
                          </div>
                          <p className="persona-reasoning" style={{ fontSize: "10px", lineHeight: "1.3" }}>
                            "{selectedProposal.verdicts?.[2]?.reasoning}"
                          </p>
                        </>
                      )}
                    </div>

                  </div>

                  {/* Combined Verdict */}
                  {selectedProposal.status !== "pending" && selectedProposal.final_reasoning && (
                    <div style={{ border: "1px solid #222", padding: "12px", background: "#050505", borderRadius: "4px", borderLeft: "3px solid var(--matrix-green)", fontSize: "12px", marginBottom: "20px" }}>
                      <strong>Consensus Combiner Verdict:</strong>
                      <p style={{ marginTop: "4px", color: "#ccc" }}>{selectedProposal.final_reasoning}</p>
                    </div>
                  )}
                </div>

                {/* Main Action Workspace */}
                <div style={{ marginTop: "15px" }}>
                  {selectedProposal.status === "pending" && (
                    <button 
                      onClick={() => handleRunCouncil(selectedProposal.id)} 
                      className="btn"
                      style={{ width: "100%" }}
                      disabled={actionLoading === `council-${selectedProposal.id}`}
                    >
                      {actionLoading === `council-${selectedProposal.id}` ? (
                        <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                          <Loader className="animate-spin" size={16} /> COMMUNING WITH AI AGENTS ONCHAIN (STUDIONET)...
                        </span>
                      ) : (
                        <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                          <Play size={14} /> TRIGGER AI COUNCIL CONSENSUS EVALUATION
                        </span>
                      )}
                    </button>
                  )}

                  {selectedProposal.status === "approved" && (
                    <button 
                      onClick={() => handleExecutePayout(selectedProposal)} 
                      className="btn btn-magenta"
                      style={{ width: "100%" }}
                      disabled={actionLoading === `execute-${selectedProposal.id}` || executingPids.has(selectedProposal.id)}
                    >
                      {actionLoading === `execute-${selectedProposal.id}` || executingPids.has(selectedProposal.id) ? (
                        <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                          <Loader className="animate-spin" size={16} /> EXECUTING 1SHOT GASLESS RELAY...
                        </span>
                      ) : (
                        <span style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                          <CheckCircle size={14} /> RELEASE FUNDS FROM TREASURY ({Number(selectedProposal.approved_amount_micro) / 1e6} USDC)
                        </span>
                      )}
                    </button>
                  )}

                  {selectedProposal.status === "executed" && (
                    <div style={{ padding: "12px", border: "1px solid var(--matrix-green)", background: "rgba(0, 255, 65, 0.02)", textAlign: "center", borderRadius: "4px" }}>
                      <div style={{ fontWeight: "bold", color: "var(--matrix-green)", marginBottom: "4px" }}>
                        PAYOUT SUCCESSFULLY EXECUTED
                      </div>
                      {selectedProposal.tx_hash && (
                        <a 
                          href={`https://sepolia.basescan.org/tx/${selectedProposal.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn"
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", padding: "4px 12px", fontSize: "11px" }}
                        >
                          View Transaction on Basescan <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, color: "var(--system-gray)", padding: "40px", textAlign: "center", height: "300px" }}>
                <Shield size={32} style={{ marginBottom: "12px", strokeWidth: 1.5, opacity: 0.5 }} />
                <span>[SELECT A PROPOSAL FROM THE ACTIVE QUEUE TO BEGIN AI EVALUATION OR RELEASE FUNDS]</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Logger Box */}
      <div className="terminal-window" style={{ marginTop: "24px" }}>
        <div className="window-header">
          <span className="window-title">
            <Terminal size={14} /> LIVE_EVALUATION_LOGGER.LOG
          </span>
        </div>
        <div className="window-body" style={{ padding: "0" }}>
          <div className="code-screen" style={{ maxHeight: "150px", height: "120px", borderRadius: "0", border: "none" }}>
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
