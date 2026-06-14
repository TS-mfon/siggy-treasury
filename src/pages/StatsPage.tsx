import React, { useState, useEffect } from "react";
import { BarChart2, Activity, Link2, GitCommit, Shield } from "lucide-react";
import { getAllProposals } from "../lib/genlayer";

interface Proposal {
  id: number;
  title: string;
  category: string;
  recipient: string;
  approved_amount_micro: bigint | string;
  status: string;
  tx_hash: string;
  created_at: string;
}

export const StatsPage: React.FC = () => {
  const [history, setHistory] = useState<Proposal[]>([]);
  const [stats, setStats] = useState({
    totalExecuted: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalPending: 0,
    sumSpentUSDC: 0,
    avgPayoutUSDC: 0,
  });

  useEffect(() => {
    getAllProposals()
      .then((list) => {
        const formatted: Proposal[] = list.map((p: any) => ({
          id: Number(p.id),
          title: p.title,
          category: p.category,
          recipient: p.recipient,
          approved_amount_micro: p.approved_amount_micro,
          status: p.status,
          tx_hash: p.tx_hash,
          created_at: p.created_at,
        }));
        setHistory(formatted);

        // Compute metrics
        let executedCount = 0;
        let approvedCount = 0;
        let rejectedCount = 0;
        let pendingCount = 0;
        let totalUSDC = 0;

        formatted.forEach((p) => {
          if (p.status === "executed") {
            executedCount++;
            totalUSDC += Number(p.approved_amount_micro) / 1e6;
          } else if (p.status === "approved") {
            approvedCount++;
          } else if (p.status === "rejected") {
            rejectedCount++;
          } else if (p.status === "pending") {
            pendingCount++;
          }
        });

        setStats({
          totalExecuted: executedCount,
          totalApproved: approvedCount,
          totalRejected: rejectedCount,
          totalPending: pendingCount,
          sumSpentUSDC: totalUSDC,
          avgPayoutUSDC: executedCount > 0 ? totalUSDC / executedCount : 0,
        });
      })
      .catch((e) => {
        console.error("Error loading stats:", e);
      });
  }, []);

  return (
    <div className="stats-page">
      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <BarChart2 size={14} /> TREASURY_ANALYTICS.EXE
          </span>
        </div>
        <div className="window-body">
          <div className="grid-3" style={{ marginBottom: "24px" }}>
            <div className="stat-box glowing">
              <div className="stat-label">TOTAL DISTRIBUTED</div>
              <div className="stat-value">{stats.sumSpentUSDC.toFixed(2)} USDC</div>
              <div style={{ fontSize: "10px", color: "var(--system-gray)", marginTop: "6px" }}>
                Accumulated gasless USDC execution
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-label">AVERAGE PAYOUT</div>
              <div className="stat-value">{stats.avgPayoutUSDC.toFixed(2)} USDC</div>
              <div style={{ fontSize: "10px", color: "var(--system-gray)", marginTop: "6px" }}>
                Per approved and executed proposal
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-label">COUNCIL EFFICIENCY</div>
              <div className="stat-value" style={{ color: "var(--matrix-green)" }}>100%</div>
              <div style={{ fontSize: "10px", color: "var(--system-gray)", marginTop: "6px" }}>
                Auto-democracy consensus engine
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div style={{ padding: "18px", border: "1px solid #222", borderRadius: "4px" }}>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={12} /> PROPOSAL RESOLUTION RATIOS
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Executed Payouts ({stats.totalExecuted})</span>
                    <span>
                      {history.length > 0 ? ((stats.totalExecuted / history.length) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "var(--matrix-green)", width: `${history.length > 0 ? (stats.totalExecuted / history.length) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Approved & Pending Execution ({stats.totalApproved})</span>
                    <span>
                      {history.length > 0 ? ((stats.totalApproved / history.length) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#00bfff", width: `${history.length > 0 ? (stats.totalApproved / history.length) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Rejected Proposals ({stats.totalRejected})</span>
                    <span>
                      {history.length > 0 ? ((stats.totalRejected / history.length) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "var(--cyber-magenta)", width: `${history.length > 0 ? (stats.totalRejected / history.length) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Pending Council Review ({stats.totalPending})</span>
                    <span>
                      {history.length > 0 ? ((stats.totalPending / history.length) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#f59e0b", width: `${history.length > 0 ? (stats.totalPending / history.length) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "18px", border: "1px solid #222", borderRadius: "4px" }}>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={12} /> RELAYER PLATFORM METRICS
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "4px" }}>
                  <span style={{ color: "#777" }}>1SHOT ENDPOINT:</span>
                  <span>https://relayer.1shotapi.com/relayers</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "4px" }}>
                  <span style={{ color: "#777" }}>CHAIN:</span>
                  <span>Base Sepolia Testnet (84532)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "4px" }}>
                  <span style={{ color: "#777" }}>USDC CONTRACT:</span>
                  <span>0x036CbD53842c5426634e7929541eC2318f3dCF7e</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: "4px" }}>
                  <span style={{ color: "#777" }}>RELAY CAPABILITY:</span>
                  <span style={{ color: "var(--matrix-green)" }}>Sponsored / Gasless USDC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Link2 size={14} /> HISTORICAL_PAYOUT_LOG.TXT
          </span>
        </div>
        <div className="window-body" style={{ padding: "0", overflowX: "auto" }}>
          <table className="terminal-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>PROPOSAL TITLE</th>
                <th>RECIPIENT</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
                <th>TRANSACTION HASH</th>
              </tr>
            </thead>
            <tbody>
              {history.filter(h => h.status === "executed").length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--system-gray)" }}>
                    [NO EXECUTED TRANSACTIONS LOGGED]
                  </td>
                </tr>
              ) : (
                history
                  .filter((h) => h.status === "executed")
                  .map((h) => (
                    <tr key={h.id}>
                      <td>#{h.id}</td>
                      <td style={{ fontWeight: "bold" }}>{h.title}</td>
                      <td><code>{h.recipient.slice(0, 6)}...{h.recipient.slice(-4)}</code></td>
                      <td style={{ color: "var(--matrix-green)", fontWeight: "bold" }}>
                        {Number(h.approved_amount_micro) / 1e6} USDC
                      </td>
                      <td>
                        <span className="badge badge-executed">{h.status}</span>
                      </td>
                      <td>
                        {h.tx_hash ? (
                          <a 
                            href={`https://sepolia.basescan.org/tx/${h.tx_hash}`} 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ display: "flex", alignItems: "center", gap: "6px" }}
                          >
                            <GitCommit size={12} /> {h.tx_hash.slice(0, 10)}...
                          </a>
                        ) : "N/A"}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
