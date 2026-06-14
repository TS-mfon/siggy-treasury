import React, { useState, useEffect } from "react";
import { Terminal, Plus, Play, CheckCircle, Loader } from "lucide-react";
import { 
  submitProposal, 
  evaluateProposal, 
  getAllProposals, 
  markExecuted,
  getExecutionContext
} from "../lib/genlayer";
import { 
  getCapabilities, 
  estimate7710Transaction, 
  send7710Transaction, 
  pollTransactionStatus, 
  encodeErc20Transfer
} from "../lib/relayer";
import { USDC_BASE_SEPOLIA, publicClient } from "../lib/delegation";
import { erc20Abi } from "viem";

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

export const ProposalPage: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(["SIGGY_OS [v1.0.0] Proposal console ready."]);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("grant");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const list = await getAllProposals();
      console.log("Proposals list fetched:", list);
      // Map bigints/strings appropriately
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

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !recipient || !amount) {
      addLog("[ERROR] Form validation failed: All fields are required.");
      return;
    }
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      addLog("[ERROR] Invalid proposal amount.");
      return;
    }

    setIsSubmitting(true);
    addLog(`[START] Creating proposal: "${title}"...`);
    try {
      const amountMicro = BigInt(Math.round(amountVal * 1e6));
      
      // 1. Fetch execution context
      const execContext = await getExecutionContext();
      if (!execContext || !execContext.treasury_address || execContext.treasury_address === "0x" || execContext.treasury_address === "") {
        throw new Error("Treasury address is not registered on the GenLayer contract. Setup delegation first in Admin Panel.");
      }
      
      // 2. Fetch USDC balance of treasury
      addLog(`[INFO] Verifying treasury USDC balance at: ${execContext.treasury_address}...`);
      const balanceVal = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [execContext.treasury_address as `0x${string}`],
      }) as bigint;
      
      if (amountMicro > balanceVal) {
        throw new Error(`Insufficient funds in DAO Treasury! Available: ${Number(balanceVal) / 1e6} USDC, Requested: ${amountVal} USDC`);
      }
      addLog(`[SUCCESS] Treasury balance verified (${Number(balanceVal) / 1e6} USDC available).`);

      const txHash = await submitProposal(
        title,
        description,
        category,
        recipient,
        amountMicro
      );
      addLog(`[SUCCESS] Proposal recorded on GenLayer. Tx: ${txHash}`);
      
      // Reset form
      setTitle("");
      setDescription("");
      setRecipient("");
      setAmount("");
      
      await fetchProposals();
    } catch (err: any) {
      addLog(`[ERROR] Submission failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunCouncil = async (pid: number) => {
    setActionLoading(`council-${pid}`);
    addLog(`[START] Triggering GenLayer AI Council evaluation for Proposal ID: ${pid}...`);
    addLog("[INFO] Invoking The Skeptic, The Strategist, and The Ethicist on Studionet...");
    try {
      await evaluateProposal(pid);
      addLog(`[SUCCESS] AI Council has successfully finalized consensus for Proposal ${pid}!`);
      
      // Fetch and verify proposals status
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

      const updatedProp = formatted.find((p) => p.id === pid);
      if (updatedProp && updatedProp.status === "approved") {
        addLog(`[AUTO-DEMOCRACY] Proposal approved on GenLayer! Automatically executing payout...`);
        await handleExecutePayout(updatedProp);
      } else {
        addLog(`[INFO] Proposal not approved for execution. Status: ${updatedProp?.status}`);
      }
    } catch (err: any) {
      addLog(`[ERROR] Council evaluation failed: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecutePayout = async (proposal: Proposal) => {
    setActionLoading(`execute-${proposal.id}`);
    addLog(`[START] Commencing gasless payout for Proposal ID: ${proposal.id}...`);

    try {
      // 1. Get execution context from GenLayer
      addLog("[STEP 1] Fetching authorized permission delegation from GenLayer...");
      const execContext = await getExecutionContext();
      if (!execContext.delegation_payload) {
        throw new Error("No delegation payload registered on the GenLayer contract. Setup required.");
      }
      
      const signedDelegationBundle = JSON.parse(execContext.delegation_payload);
      addLog("[SUCCESS] Authorized delegation payload retrieved.");

      // 2. Discover Relayer capabilities & target fee address
      addLog("[STEP 2] Discovering 1Shot Relayer capabilities...");
      const capabilities = await getCapabilities("84532");
      const targetFeeAddress = capabilities.targetAddress || "0xe696417A6129F29E04E586c071d07c089E2CE2DE";
      addLog(`[INFO] Relayer target fee address: ${targetFeeAddress}`);

      // 3. Assemble Payout Work Transaction
      addLog("[STEP 3] Assembling work transaction...");
      const amountMicro = BigInt(proposal.approved_amount_micro.toString());
      const workCalldata = encodeErc20Transfer(proposal.recipient, amountMicro);
      const workTx = {
        to: USDC_BASE_SEPOLIA,
        data: workCalldata,
        value: "0x0"
      };

      // 4. Estimate gas fee against relayer (First pass)
      addLog("[STEP 4] Estimating gas payment requirement (First Pass)...");
      const initialEstimate = await estimate7710Transaction(
        "84532",
        USDC_BASE_SEPOLIA,
        [workTx],
        signedDelegationBundle
      );
      
      const feeAmount = BigInt(initialEstimate.requiredPaymentAmount);
      addLog(`[INFO] Relayer fee required: ${Number(feeAmount) / 1e6} USDC`);

      // 5. Build Fee Transaction & bundle
      addLog("[STEP 5] Encoding fee payment and compiling final transaction bundle...");
      const feeCalldata = encodeErc20Transfer(targetFeeAddress, feeAmount);
      const feeTx = {
        to: USDC_BASE_SEPOLIA,
        data: feeCalldata,
        value: "0x0"
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
      setActionLoading(null);
    }
  };

  return (
    <div className="proposals-page">
      <div className="grid-2">
        {/* Proposal Submission Form */}
        <div className="terminal-window">
          <div className="window-header">
            <span className="window-title">
              <Plus size={14} /> NEW_PROPOSAL_FORM.EXE
            </span>
          </div>
          <div className="window-body">
            <form onSubmit={handleCreateProposal}>
              <div className="form-group">
                <label className="form-label">Proposal Title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Developer Grant Q3"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select 
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="grant">Grant</option>
                    <option value="contributor">Contributor</option>
                    <option value="infra">Infrastructure</option>
                    <option value="marketing">Marketing</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payout Amount (USDC)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-input" 
                    placeholder="Min 0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Recipient Address (Base Sepolia)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Strategic Rationale & Milestones</label>
                <textarea 
                  className="form-textarea" 
                  placeholder="Provide structured details on budget utilization and mission alignment..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <button 
                type="submit" 
                className="btn" 
                style={{ width: "100%" }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "RECORDING ON GENLAYER..." : "SUBMIT PROPOSAL"}
              </button>
            </form>
          </div>
        </div>

        {/* Proposals List */}
        <div className="terminal-window">
          <div className="window-header">
            <span className="window-title">
              <Terminal size={14} /> PROPOSAL_REGISTRY_VIEW.EXE
            </span>
          </div>
          <div className="window-body" style={{ minHeight: "350px", overflowY: "auto" }}>
            {isLoading && proposals.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", gap: "10px" }}>
                <Loader className="animate-spin" size={16} /> Loading proposals...
              </div>
            ) : proposals.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--system-gray)" }}>
                [NO ACTIVE PROPOSALS RECORDED]
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {proposals.map((p) => {
                  const isExpanded = expandedId === p.id;
                  const reqAmt = Number(p.requested_amount_micro) / 1e6;
                  const appAmt = Number(p.approved_amount_micro) / 1e6;
                  
                  return (
                    <div key={p.id} style={{ borderBottom: "1px solid #222", padding: "12px 0" }}>
                      <div 
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <div>
                          <div style={{ fontSize: "11px", color: "var(--system-gray)" }}>
                            PID #{p.id} | {p.category.toUpperCase()}
                          </div>
                          <div style={{ fontWeight: "bold", textShadow: isExpanded ? "0 0 5px var(--matrix-green)" : "none" }}>
                            {p.title}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ fontWeight: "bold" }}>{reqAmt} USDC</div>
                          <span className={`badge badge-${p.status}`}>
                            {p.status}
                          </span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: "15px", padding: "15px", border: "1px solid #333", background: "#0a0a0a", borderRadius: "4px" }}>
                          <div style={{ marginBottom: "12px", fontSize: "12px", color: "#ccc" }}>
                            <strong>Strategic Rationale:</strong>
                            <p style={{ marginTop: "6px", fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.4" }}>
                              {p.description}
                            </p>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#888", borderBottom: "1px solid #222", paddingBottom: "6px", marginBottom: "12px" }}>
                            <span>Recipient: <code style={{ color: "var(--matrix-green)" }}>{p.recipient}</code></span>
                            <span>Proposer: <code>{p.proposer.slice(0, 6)}...</code></span>
                          </div>

                          {/* AI Verdicts Section */}
                          {p.status !== "pending" && p.verdicts && (
                            <div style={{ margin: "15px 0" }}>
                              <h4 style={{ fontSize: "12px", textTransform: "uppercase", marginBottom: "10px", color: "var(--matrix-green)" }}>
                                AI Council Decision Breakdown
                              </h4>
                              <div className="grid-3" style={{ gap: "12px" }}>
                                {p.verdicts.map((v, i) => (
                                  <div key={i} className={`persona-card ${v.vote === "approve" ? "approve" : "reject"}`}>
                                    <div className="persona-name" style={{ fontSize: "10px", display: "flex", justifyContent: "space-between" }}>
                                      <span>{v.persona.toUpperCase()}</span>
                                      <span style={{ color: v.vote === "approve" ? "var(--matrix-green)" : "var(--cyber-magenta)" }}>
                                        {v.vote.toUpperCase()}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: "9px", color: "#666", marginBottom: "6px" }}>
                                      Conf: {Number(v.confidence)}% | Cap: {Number(v.max_amount_micro) / 1e6} USDC
                                    </div>
                                    <p className="persona-reasoning" style={{ fontSize: "10px" }}>
                                      "{v.reasoning}"
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {p.final_reasoning && (
                                <div style={{ border: "1px solid #222", padding: "10px", background: "#050505", marginTop: "12px", fontSize: "11px", borderLeft: "2px solid var(--matrix-green)" }}>
                                  <strong>Consensus combiner verdict:</strong> {p.final_reasoning}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Controls */}
                          <div style={{ marginTop: "15px", display: "flex", gap: "12px" }}>
                            {p.status === "pending" && (
                              <button 
                                onClick={() => handleRunCouncil(p.id)} 
                                className="btn"
                                style={{ width: "100%", padding: "6px 12px" }}
                                disabled={actionLoading === `council-${p.id}`}
                              >
                                {actionLoading === `council-${p.id}` ? (
                                  <span style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                                    <Loader className="animate-spin" size={14} /> COMPUTING ONCHAIN CONSENSUS...
                                  </span>
                                ) : (
                                  <span style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                                    <Play size={12} /> RUN COUNCIL EVALUATION
                                  </span>
                                )}
                              </button>
                            )}

                            {p.status === "approved" && (
                              <button 
                                onClick={() => handleExecutePayout(p)} 
                                className="btn btn-magenta"
                                style={{ width: "100%", padding: "6px 12px" }}
                                disabled={actionLoading === `execute-${p.id}`}
                              >
                                {actionLoading === `execute-${p.id}` ? (
                                  <span style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                                    <Loader className="animate-spin" size={14} /> EXECUTING 1SHOT RELAY...
                                  </span>
                                ) : (
                                  <span style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
                                    <CheckCircle size={12} /> EXECUTE PAYOUT ({appAmt} USDC)
                                  </span>
                                )}
                              </button>
                            )}

                            {p.status === "executed" && p.tx_hash && (
                              <a 
                                href={`https://sepolia.basescan.org/tx/${p.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn"
                                style={{ width: "100%", padding: "6px 12px", textAlign: "center" }}
                              >
                                VIEW TRANSACTION ON BASESCAN
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logger Box */}
      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Terminal size={14} /> LIVE_PROPOSAL_LOGGER_STREAM.LOG
          </span>
        </div>
        <div className="window-body" style={{ padding: "0" }}>
          <div className="code-screen" style={{ maxHeight: "200px", height: "150px", borderRadius: "0", border: "none" }}>
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
