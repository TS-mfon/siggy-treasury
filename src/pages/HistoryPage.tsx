import React, { useState, useEffect } from "react";
import { Search, ExternalLink, BookOpen, Clock } from "lucide-react";
import { getAllProposals } from "../lib/genlayer";

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

export const HistoryPage: React.FC = () => {
  const [history, setHistory] = useState<Proposal[]>([]);
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchHistory = async () => {
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
      // Sort history descending by PID
      setHistory(formatted.reverse());
    } catch (e) {
      console.error("Failed to load historical proposals:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredHistory = history.filter((p) => {
    const matchesSearch = 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.id) === searchTerm;
      
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <div className="history-page">
      
      {/* Search and Filters Window */}
      <div className="terminal-window" style={{ marginBottom: "24px" }}>
        <div className="window-header">
          <span className="window-title">
            <Search size={14} /> ARCHIVE_FILTER_SETTINGS.CFG
          </span>
        </div>
        <div className="window-body">
          <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr 1fr", gap: "15px" }}>
            
            <div className="form-group">
              <label className="form-label" style={{ fontSize: "10px" }}>Search by Title, Recipient, PID...</label>
              <div style={{ position: "relative" }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Enter keywords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: "30px" }}
                />
                <Search size={12} style={{ position: "absolute", left: "10px", top: "12px", color: "var(--system-gray)" }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: "10px" }}>Filter Status</label>
              <select 
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">ALL STATUSES</option>
                <option value="pending">PENDING</option>
                <option value="approved">APPROVED</option>
                <option value="rejected">REJECTED</option>
                <option value="executed">EXECUTED</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: "10px" }}>Filter Category</label>
              <select 
                className="form-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">ALL CATEGORIES</option>
                <option value="grant">GRANT</option>
                <option value="contributor">CONTRIBUTOR</option>
                <option value="infra">INFRASTRUCTURE</option>
                <option value="marketing">MARKETING</option>
                <option value="other">OTHER</option>
              </select>
            </div>

          </div>
        </div>
      </div>

      {/* Historical Logs List */}
      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <BookOpen size={14} /> PROPOSAL_HISTORY_REGISTRY.DB
          </span>
        </div>
        <div className="window-body" style={{ minHeight: "350px" }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
              <Clock className="animate-spin" size={16} style={{ marginRight: "8px" }} /> Querying index database...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ padding: "50px", textAlign: "center", color: "var(--system-gray)" }}>
              [NO ARCHIVE MATCHES SEARCH PARAMETERS]
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {filteredHistory.map((p) => {
                const isExpanded = expandedPid === p.id;
                const reqAmt = Number(p.requested_amount_micro) / 1e6;
                const appAmt = Number(p.approved_amount_micro) / 1e6;
                
                return (
                  <div key={p.id} style={{ borderBottom: "1px solid #1a1a1a", padding: "15px 0" }}>
                    
                    {/* Summary row */}
                    <div 
                      onClick={() => setExpandedPid(isExpanded ? null : p.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "10px", color: "var(--system-gray)", padding: "1px 4px", border: "1px solid #333", borderRadius: "2px" }}>
                            PID #{p.id}
                          </span>
                          <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase" }}>
                            {p.category}
                          </span>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: "bold", color: isExpanded ? "#fff" : "var(--matrix-green)", textShadow: isExpanded ? "0 0 5px var(--matrix-glow)" : "none" }}>
                          {p.title}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontWeight: "bold", fontSize: "14px" }}>{reqAmt} USDC</span>
                        </div>
                        <span className={`badge badge-${p.status}`}>
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Detailed section when expanded */}
                    {isExpanded && (
                      <div style={{ marginTop: "15px", padding: "18px", border: "1px solid #2a2a2a", background: "#080808", borderRadius: "4px" }}>
                        
                        {/* Meta lines */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", fontSize: "11px", color: "#777", borderBottom: "1px solid #1a1a1a", paddingBottom: "10px", marginBottom: "12px" }}>
                          <span>Proposer: <code>{p.proposer}</code></span>
                          <span>Recipient: <code style={{ color: "var(--matrix-green)" }}>{p.recipient}</code></span>
                          <span>Created: <code>{p.created_at}</code></span>
                        </div>

                        {/* Rationale */}
                        <div style={{ marginBottom: "15px" }}>
                          <span style={{ fontSize: "10px", color: "var(--system-gray)", textTransform: "uppercase" }}>Strategic Rationale:</span>
                          <p style={{ marginTop: "4px", color: "#ccc", fontFamily: "sans-serif", fontSize: "13px", lineHeight: "1.5" }}>
                            {p.description}
                          </p>
                        </div>

                        {/* AI Council results if not pending */}
                        {p.status !== "pending" && p.verdicts && (
                          <div style={{ margin: "15px 0" }}>
                            <h4 style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--matrix-green)", marginBottom: "8px", letterSpacing: "1px" }}>
                              AI COUNCIL EVALUATION REASONING DETAILS
                            </h4>
                            <div className="grid-3" style={{ gap: "10px" }}>
                              {p.verdicts.map((v, idx) => (
                                <div key={idx} className={`persona-card ${v.vote === "approve" ? "approve" : "reject"}`} style={{ minHeight: "100px" }}>
                                  <div className="persona-name" style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                                    <span>{v.persona.toUpperCase()}</span>
                                    <span style={{ color: v.vote === "approve" ? "var(--matrix-green)" : "var(--cyber-magenta)" }}>
                                      {v.vote.toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: "8px", color: "#555", marginBottom: "4px" }}>
                                    Conf: {Number(v.confidence)}% | Max: {Number(v.max_amount_micro) / 1e6} USDC
                                  </div>
                                  <p className="persona-reasoning" style={{ fontSize: "10px", color: "#aaa", lineHeight: "1.3" }}>
                                    "{v.reasoning}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Combiner and execution info */}
                        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {p.final_reasoning && (
                            <div style={{ fontSize: "11px", color: "#ccc", background: "#050505", padding: "8px", border: "1px solid #111", borderLeft: "2px solid var(--matrix-green)" }}>
                              <strong>Consensus combiner verdict:</strong> {p.final_reasoning}
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", fontSize: "11px", marginTop: "5px" }}>
                            <span>Approved Payout: <strong style={{ color: "var(--matrix-green)" }}>{appAmt} USDC</strong></span>
                            {p.status === "executed" && p.tx_hash ? (
                              <a 
                                href={`https://sepolia.basescan.org/tx/${p.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn"
                                style={{ padding: "2px 10px", fontSize: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                Basescan Receipt <ExternalLink size={10} />
                              </a>
                            ) : p.status === "approved" ? (
                              <span style={{ color: "#ffb703" }}>[Awaiting manual payout release in Chamber]</span>
                            ) : p.status === "pending" ? (
                              <span style={{ color: "var(--system-gray)" }}>[Awaiting AI Council run]</span>
                            ) : (
                              <span style={{ color: "var(--cyber-magenta)" }}>[Rejection Finalized]</span>
                            )}
                          </div>
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
  );
};
