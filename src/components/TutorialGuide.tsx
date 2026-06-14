import React, { useState, useEffect } from "react";
import { Terminal, ChevronLeft, ChevronRight, X, HelpCircle, CheckCircle2 } from "lucide-react";
import { publicClient, USDC_BASE_SEPOLIA } from "../lib/delegation";
import { erc20Abi } from "viem";

interface TutorialGuideProps {
  ownerAddress: string;
  isConfigured: boolean;
  treasuryAddress: string;
  totalProposals: number;
}

interface Step {
  id: number;
  title: string;
  desc: string;
  check: string;
}

export const TutorialGuide: React.FC<TutorialGuideProps> = ({
  ownerAddress,
  isConfigured,
  treasuryAddress,
  totalProposals,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);

  // Steps definition
  const steps: Step[] = [
    {
      id: 1,
      title: "CONNECT ADMIN WALLET",
      desc: "Connect your MetaMask wallet using the EOA admin account. Click the 'CONNECT WALLET' button at the bottom of the left sidebar.",
      check: "Connected: EOA key recognized by console."
    },
    {
      id: 2,
      title: "GRANT ERC-7715 DELEGATION",
      desc: "Navigate to the 'Admin Panel' in the sidebar menu. Click 'GRANT DELEGATION (ERC-7715)' to authorize the council executor burner wallet to run gasless payouts.",
      check: "Configured: Delegation registered on GenLayer contract."
    },
    {
      id: 3,
      title: "FUND TREASURY SMART ACCOUNT",
      desc: `Send Base Sepolia USDC tokens to your Treasury Smart Account address: \`${treasuryAddress || "Not Calculated Yet"}\`. Payouts require funds to execute!`,
      check: "Funded: Treasury USDC balance must be greater than 0."
    },
    {
      id: 4,
      title: "SUBMIT PAYOUT PROPOSAL",
      desc: "Go to the 'Run Proposals' console. Submit a spending proposal with a title, recipient address, category, and USDC amount.",
      check: "Submitted: Proposal logged to the GenLayer Studionet registry."
    },
    {
      id: 5,
      title: "RUN AI COUNCIL CONSENSUS",
      desc: "Go to the new 'Evaluate Proposals' workspace in the sidebar. Select your pending proposal and click 'RUN AI COUNCIL EVALUATION' to summon the AI agents.",
      check: "Evaluated: The Skeptic, Strategist, and Ethicist return votes onchain."
    },
    {
      id: 6,
      title: "EXECUTE GASLESS PAYOUT",
      desc: "If the council votes approve the proposal, click the 'RELEASE FUNDS FROM TREASURY' button in the Chamber. The burner wallet will process the transfer gaslessly!",
      check: "Executed: Funds released, transaction receipt recorded on Basescan."
    }
  ];

  // Fetch Treasury USDC Balance to auto-advance step
  const checkTreasuryBalance = async () => {
    if (!treasuryAddress || treasuryAddress === "0x") return;
    try {
      const val = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [treasuryAddress as `0x${string}`],
      }) as bigint;
      setUsdcBalance(Number(val) / 1e6);
    } catch (e) {
      console.log("Tour Guide: Failed to fetch balance:", e);
    }
  };

  useEffect(() => {
    if (isConfigured && treasuryAddress) {
      checkTreasuryBalance();
      const interval = setInterval(checkTreasuryBalance, 10000); // Check every 10s
      return () => clearInterval(interval);
    }
  }, [isConfigured, treasuryAddress]);

  // Determine current system step based on live state variables
  const getSystemStep = (): number => {
    if (!ownerAddress) return 1;
    if (!isConfigured) return 2;
    if (usdcBalance === 0) return 3;
    if (totalProposals === 0) return 4;
    // Step 5 or 6 depends on whether there are pending/approved proposals
    return 5;
  };

  const systemRecommendedStep = getSystemStep();

  // On mount or state update, auto-update the active step to system recommended
  useEffect(() => {
    setActiveStep(systemRecommendedStep);
  }, [ownerAddress, isConfigured, usdcBalance, totalProposals, systemRecommendedStep]);

  const handlePrev = () => {
    if (activeStep > 1) setActiveStep(activeStep - 1);
  };

  const handleNext = () => {
    if (activeStep < steps.length) setActiveStep(activeStep + 1);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "var(--bg-darker)",
          border: "1px solid var(--matrix-green)",
          color: "var(--matrix-green)",
          borderRadius: "4px",
          padding: "10px 15px",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: "0 0 10px rgba(0,255,65,0.2)",
          zIndex: 1000,
          transition: "all 0.2s"
        }}
      >
        <HelpCircle size={14} /> SIGGY_GUIDE.EXE
      </button>
    );
  }

  const currentStepData = steps[activeStep - 1];
  const isRecommended = activeStep === systemRecommendedStep;

  // Calculate completion percentage
  const pct = Math.round(((systemRecommendedStep - 1) / steps.length) * 100);
  const progressBar = `[${"█".repeat(systemRecommendedStep - 1)}${"░".repeat(steps.length - (systemRecommendedStep - 1))}]`;

  return (
    <div 
      className="terminal-window"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "320px",
        zIndex: 1000,
        boxShadow: "0 0 15px rgba(0, 255, 65, 0.25)",
        border: "1px solid var(--matrix-green)",
        background: "#080808",
      }}
    >
      <div className="window-header" style={{ cursor: "default" }}>
        <span className="window-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Terminal size={14} /> SIGGY_GUIDE.EXE
        </span>
        <button 
          onClick={() => setIsOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "var(--cyber-magenta)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center"
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="window-body" style={{ padding: "12px", fontSize: "11px" }}>
        
        {/* Progress Tracker */}
        <div style={{ borderBottom: "1px solid #222", paddingBottom: "10px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--system-gray)", fontSize: "9px" }}>
            <span>PROGRESS: {pct}%</span>
            <span>SYSTEM STATE</span>
          </div>
          <div style={{ fontFamily: "monospace", color: "var(--matrix-green)", marginTop: "2px", letterSpacing: "1px" }}>
            {progressBar}
          </div>
        </div>

        {/* Step Navigation Details */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ 
              background: isRecommended ? "var(--matrix-green)" : "#333",
              color: isRecommended ? "#000" : "#fff",
              padding: "2px 6px",
              fontWeight: "bold",
              fontSize: "9px",
              borderRadius: "2px"
            }}>
              STEP {activeStep} OF {steps.length} {isRecommended && "(ACTIVE)"}
            </span>
            {activeStep < systemRecommendedStep && (
              <span style={{ color: "var(--matrix-green)", display: "flex", alignItems: "center", gap: "4px", fontSize: "9px" }}>
                <CheckCircle2 size={10} /> COMPLETED
              </span>
            )}
          </div>

          <h4 style={{ color: "#fff", fontWeight: "bold", fontSize: "12px", marginBottom: "6px" }}>
            {currentStepData.title}
          </h4>

          <p style={{ color: "#ccc", lineHeight: "1.4", minHeight: "60px", marginBottom: "10px" }}>
            {currentStepData.desc}
          </p>

          <div style={{ background: "#050505", border: "1px solid #151515", padding: "6px", color: "var(--system-gray)", fontSize: "9px", fontFamily: "monospace", marginBottom: "12px" }}>
            <strong>CRITERIA:</strong><br />
            {currentStepData.check}
          </div>
        </div>

        {/* Live balance warning in funding step */}
        {activeStep === 3 && (
          <div style={{ color: usdcBalance > 0 ? "var(--matrix-green)" : "var(--cyber-magenta)", border: "1px dashed", padding: "6px", marginBottom: "12px", fontSize: "9px" }}>
            Current Treasury Balance: <strong>{usdcBalance.toFixed(2)} USDC</strong>
            {usdcBalance === 0 && " [Awaiting tokens on Base Sepolia]"}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #222", paddingTop: "10px" }}>
          <button 
            onClick={() => setActiveStep(systemRecommendedStep)}
            className="btn"
            style={{ padding: "4px 8px", fontSize: "10px", background: "none", color: "var(--system-gray)", border: "1px solid #222" }}
            disabled={isRecommended}
          >
            AUTO-DETECT STEP
          </button>
          
          <div style={{ display: "flex", gap: "6px" }}>
            <button 
              onClick={handlePrev} 
              className="btn" 
              style={{ padding: "4px 6px" }}
              disabled={activeStep === 1}
            >
              <ChevronLeft size={12} />
            </button>
            <button 
              onClick={handleNext} 
              className="btn" 
              style={{ padding: "4px 6px" }}
              disabled={activeStep === steps.length}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
