import React from "react";
import { Link } from "react-router-dom";
import { Shield, Brain, Terminal, Cpu } from "lucide-react";

interface LandingPageProps {
  isConfigured: boolean;
  treasuryAddress: string;
  weeklyCap: string;
  totalProposals: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  isConfigured,
  treasuryAddress,
  weeklyCap,
  totalProposals,
}) => {
  return (
    <div className="landing-page">
      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Terminal size={14} /> SYSTEM_WELCOME.EXE
          </span>
          <div className="window-controls">
            <div className="dot close"></div>
            <div className="dot minimize"></div>
            <div className="dot maximize"></div>
          </div>
        </div>
        <div className="window-body">
          <div className="grid-2">
            <div>
              <div className="ascii-art">
{`    /\\_/\\
   ( o.o )  SIGGY_OS v1.0.0
    > ^ <   Autonomous AI Council
   /  -  \\  Treasury Management
  /_/ |_| \\\\`}
              </div>
              <h1 style={{ fontSize: "24px", marginBottom: "12px", textShadow: "0 0 10px var(--matrix-green)" }}>
                SIGGY TREASURY COUNCIL
              </h1>
              <p style={{ color: "#aaa", marginBottom: "20px", fontSize: "13px" }}>
                An autonomous, consensus-driven AI treasury governance system. Siggy leverages a 3-agent council on GenLayer to review, vote, and gaslessly distribute funds on Base Sepolia using MetaMask Smart Accounts and 1Shot Relayer.
              </p>
              
              <div style={{ display: "flex", gap: "12px" }}>
                <Link to="/proposals" className="btn">
                  Launch Console
                </Link>
                <Link to="/status" className="btn btn-magenta">
                  System Settings
                </Link>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <div className="stat-box glowing">
                <div className="stat-label">DAO Setup Checklist</div>
                <div style={{ marginTop: "10px", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                    <span style={{ color: "var(--matrix-green)" }}>[✓]</span> GitHub Repository Spawned
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                    <span style={{ color: "var(--matrix-green)" }}>[✓]</span> GenLayer Studionet Contract Active
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                    <span style={{ color: isConfigured ? "var(--matrix-green)" : "var(--cyber-magenta)" }}>
                      {isConfigured ? "[✓]" : "[ ]"}
                    </span>
                    <span>MetaMask Smart Account Setup {!isConfigured && "(Setup Required)"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                    <span style={{ color: isConfigured ? "var(--matrix-green)" : "var(--cyber-magenta)" }}>
                      {isConfigured ? "[✓]" : "[ ]"}
                    </span>
                    <span>ERC-7715 Permission Granted</span>
                  </div>
                </div>
              </div>

              <div className="stat-box" style={{ borderColor: "#333" }}>
                <div className="stat-label">Current Configuration</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "12px" }}>
                  <span>Treasury Account:</span>
                  <span style={{ color: isConfigured ? "var(--matrix-green)" : "#555" }}>
                    {isConfigured ? `${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}` : "NOT_INITIALIZED"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px" }}>
                  <span>Weekly Caps Limit:</span>
                  <span>{weeklyCap} USDC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px" }}>
                  <span>Active proposals:</span>
                  <span>{totalProposals} Total</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="terminal-window">
        <div className="window-header">
          <span className="window-title">
            <Brain size={14} /> DAO_MISSION_STATEMENT.TXT
          </span>
        </div>
        <div className="window-body">
          <p style={{ fontStyle: "italic", fontSize: "13px", lineHeight: "1.6", borderLeft: "2px solid var(--matrix-green)", paddingLeft: "15px" }}>
            "To build a resilient, decentralized treasury managed by consensus-driven AI agents. The treasury allocates capital to high-impact projects, infrastructure developments, and community grants on Base Sepolia. The AI council ensures compliance with budget allocations, growth roadmaps, and ethical execution, prioritizing security and alignment with the DAO's values."
          </p>
        </div>
      </div>

      <div className="grid-3">
        <div className="persona-card approve">
          <div className="persona-name" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={14} /> THE SKEPTIC
          </div>
          <div className="persona-vote" style={{ color: "var(--matrix-green)" }}>
            Sustainability & Risk Evaluator
          </div>
          <p className="persona-reasoning">
            Conserves DAO resources by critically analyzing proposal budgets, runway depletion, and recipient verify-ability.
          </p>
        </div>

        <div className="persona-card approve">
          <div className="persona-name" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Cpu size={14} /> THE STRATEGIST
          </div>
          <div className="persona-vote" style={{ color: "var(--matrix-green)" }}>
            Growth & Roadmap Evaluator
          </div>
          <p className="persona-reasoning">
            Assesses mission alignment, potential ROI, strategic positioning, and expected milestone impacts.
          </p>
        </div>

        <div className="persona-card approve">
          <div className="persona-name" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Brain size={14} /> THE ETHICIST
          </div>
          <div className="persona-vote" style={{ color: "var(--matrix-green)" }}>
            Constitution & Equity Evaluator
          </div>
          <p className="persona-reasoning">
            Ensures compliance with Siggy Constitution, fair compensation, and equitable distribution of funds.
          </p>
        </div>
      </div>
    </div>
  );
};
