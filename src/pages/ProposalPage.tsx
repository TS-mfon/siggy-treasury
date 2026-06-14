import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Terminal, Plus, ArrowRight, ExternalLink, Loader } from "lucide-react";
import { 
  submitProposal, 
  getAllProposals, 
  getExecutionContext
} from "../lib/genlayer";
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
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState<string[]>(["SIGGY_OS [v1.0.0] Proposal console ready."]);

  // Success modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedProposalPid, setSubmittedProposalPid] = useState<number | null>(null);

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
      return formatted;
    } catch (e: any) {
      addLog(`[WARN] Failed to load proposals: ${e.message || e}`);
      return [];
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
      const hasTreasury = execContext && execContext.treasury_address && execContext.treasury_address !== "0x" && execContext.treasury_address !== "";
      
      if (hasTreasury) {
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
      } else {
        addLog(`[WARN] Treasury delegation is not active on GenLayer. Payouts cannot be executed automatically until delegation is set up in the Admin Panel.`);
      }

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
      
      const latestProposals = await fetchProposals();

      // Find the proposal we just created
      if (latestProposals.length > 0) {
        const newest = latestProposals.reduce((prev: any, current: any) => (prev.id > current.id) ? prev : current);
        setSubmittedProposalPid(newest.id);
        setShowSuccessModal(true);
      }
    } catch (err: any) {
      addLog(`[ERROR] Submission failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
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

                          {/* Controls Redirecting to Evaluation Workspace */}
                          <div style={{ marginTop: "15px" }}>
                            {(p.status === "pending" || p.status === "approved") ? (
                              <button 
                                onClick={() => navigate(`/evaluate?pid=${p.id}`)} 
                                className="btn"
                                style={{ width: "100%", padding: "6px 12px", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}
                              >
                                <ArrowRight size={12} /> ENTER EVALUATION CHAMBER (PID #{p.id})
                              </button>
                            ) : p.status === "executed" && p.tx_hash ? (
                              <a 
                                href={`https://sepolia.basescan.org/tx/${p.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn"
                                style={{ width: "100%", padding: "6px 12px", textAlign: "center", display: "block" }}
                              >
                                VIEW TRANSACTION ON BASESCAN <ExternalLink size={10} style={{ display: "inline", marginLeft: "4px" }} />
                              </a>
                            ) : (
                              <div style={{ color: "var(--cyber-magenta)", fontSize: "11px", textAlign: "center", border: "1px dashed #333", padding: "6px" }}>
                                PROPOSAL REJECTED BY COUNCIL DECISION
                              </div>
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

      {/* Success Modal */}
      {showSuccessModal && submittedProposalPid !== null && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 2000,
          backdropFilter: "blur(2px)"
        }}>
          <div className="terminal-window" style={{ width: "420px", boxShadow: "0 0 20px var(--matrix-glow)" }}>
            <div className="window-header">
              <span className="window-title">PROPOSAL_RECORDED.SYS</span>
              <button 
                onClick={() => setShowSuccessModal(false)} 
                style={{ background: "none", border: "none", color: "var(--cyber-magenta)", cursor: "pointer", fontSize: "12px" }}
              >
                [X]
              </button>
            </div>
            <div className="window-body" style={{ textAlign: "center", padding: "24px" }}>
              <div className="ascii-art" style={{ color: "var(--matrix-green)", fontSize: "8px", margin: "10px 0" }}>
{`   _____ _    _  _____ _____ ______  _____ _____ 
  / ____| |  | |/ ____/ ____|  ____|/ ____/ ____|
 | (___ | |  | | |   | |    | |__  | (___| (___  
  \\___ \\| |  | | |   | |    |  __|  \\___ \\\\___ \\ 
  ____) | |__| | |___| |____| |____ ____) |___) |
 |_____/ \\____/ \\_____\\_____|______|_____/_____/ `}
              </div>
              <p style={{ color: "var(--matrix-green)", fontSize: "13px", fontWeight: "bold", margin: "15px 0" }}>
                PROPOSAL COMMITTED ONCHAIN
              </p>
              <p style={{ color: "#ccc", fontSize: "11px", marginBottom: "20px", lineHeight: "1.4" }}>
                Proposal ID #{submittedProposalPid} was registered on GenLayer Studionet. Trigger evaluation to summon the AI Council and release treasury funds.
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <button 
                  className="btn" 
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate(`/evaluate?pid=${submittedProposalPid}`);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  RUN EVALUATION <ArrowRight size={12} />
                </button>
                <button 
                  className="btn btn-magenta" 
                  onClick={() => setShowSuccessModal(false)}
                >
                  SKIP FOR NOW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

