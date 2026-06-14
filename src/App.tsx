import React, { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import { Terminal, Shield, Wallet, Brain, BarChart2, Cpu, ExternalLink } from "lucide-react";
import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import { LandingPage } from "./pages/LandingPage";
import { StatusPage } from "./pages/StatusPage";
import { ProposalPage } from "./pages/ProposalPage";
import { StatsPage } from "./pages/StatsPage";
import { getAllProposals, getExecutionContext } from "./lib/genlayer";

function App() {
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [walletClient, setWalletClient] = useState<any>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [treasuryAddress, setTreasuryAddress] = useState("");
  const [totalProposals, setTotalProposals] = useState(0);

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const addresses = await (window as any).ethereum.request({
          method: "eth_requestAccounts",
        });
        const currentAddr = addresses[0];
        setOwnerAddress(currentAddr);
        
        const client = createWalletClient({
          chain: baseSepolia,
          transport: custom((window as any).ethereum),
          account: currentAddr,
        });
        setWalletClient(client);

        // Try to switch to Base Sepolia
        try {
          await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x14a34" }], // 84532 in hex
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0x14a34",
                chainName: "Base Sepolia Testnet",
                rpcUrls: ["https://sepolia.base.org"],
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.basescan.org"],
              }],
            });
          }
        }
      } catch (e) {
        console.error("Wallet connection failed:", e);
      }
    } else {
      alert("MetaMask extension not detected. Please install MetaMask to use Siggy.");
    }
  };

  useEffect(() => {
    // Check if already connected
    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum.request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            const currentAddr = accounts[0];
            setOwnerAddress(currentAddr);
            const client = createWalletClient({
              chain: baseSepolia,
              transport: custom((window as any).ethereum),
              account: currentAddr,
            });
            setWalletClient(client);
          }
        });
    }

    // Load setup data
    getExecutionContext()
      .then((ctx) => {
        if (ctx && ctx.treasury_address && ctx.delegation_payload) {
          setIsConfigured(true);
          setTreasuryAddress(ctx.treasury_address);
        }
      })
      .catch((e) => console.log("GenLayer not initialized:", e));

    getAllProposals()
      .then((list) => {
        setTotalProposals(list.length);
      })
      .catch((e) => console.log("GenLayer not initialized:", e));
  }, []);

  return (
    <Router>
      <div className="crt-screen">
        <div className="crt-overlay"></div>
        <div className="app-container">
          {/* Sidebar */}
          <aside className="sidebar">
            <div className="terminal-logo">
              <img src="/logo.png" className="logo-icon" alt="Siggy Logo" />
              <span>SIGGY_OS //</span>
            </div>

            <div className="system-status">
              <div className="status-line">
                <span>SYSTEM_STATE:</span>
                <span className={isConfigured ? "status-ok" : "status-warn"}>
                  {isConfigured ? "[STABLE]" : "[UNCONFIGURED]"}
                </span>
              </div>
              <div className="status-line">
                <span>NODE_HEALTH:</span>
                <span className="status-ok">[ONLINE]</span>
              </div>
              <div className="status-line">
                <span>GENLAYER_GAS:</span>
                <span className="status-ok">[FREE]</span>
              </div>
              <div className="status-line">
                <span>RELAYER:</span>
                <span className="status-ok">[ACTIVE]</span>
              </div>
            </div>

            <nav className="nav-menu">
              <NavLink 
                to="/" 
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                end
              >
                <Cpu size={16} /> Landing Console
              </NavLink>
              <NavLink 
                to="/proposals" 
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Brain size={16} /> Run Proposals
              </NavLink>
              <NavLink 
                to="/status" 
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Shield size={16} /> Admin Panel
              </NavLink>
              <NavLink 
                to="/stats" 
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <BarChart2 size={16} /> Analytics Info
              </NavLink>
            </nav>

            <div style={{ marginTop: "20px", marginBottom: "20px" }}>
              {ownerAddress ? (
                <div style={{ padding: "8px", border: "1px dashed var(--matrix-green)", fontSize: "11px" }}>
                  <div style={{ display: "flex", justify: "space-between", color: "var(--system-gray)" }}>
                    <span>CONNECTED ADMIN</span>
                  </div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ownerAddress}
                  </div>
                </div>
              ) : (
                <button onClick={connectWallet} className="btn" style={{ width: "100%", gap: "8px" }}>
                  <Wallet size={14} /> CONNECT WALLET
                </button>
              )}
            </div>

            <div className="sidebar-footer">
              <div>SIGGY COUNCIL CO-OP</div>
              <div style={{ marginTop: "4px" }}>BASE_SEPOLIA_CHAIN</div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="main-content">
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--matrix-green)", paddingBottom: "12px", marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", textTransform: "uppercase" }}>
                Active Session Account: <span style={{ color: "#fff" }}>Council Executor Burner Key</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "15px", fontSize: "11px" }}>
                <span>NETWORK: BASE_SEPOLIA</span>
                <span className="caret"></span>
              </div>
            </header>

            <Routes>
              <Route 
                path="/" 
                element={
                  <LandingPage 
                    isConfigured={isConfigured} 
                    treasuryAddress={treasuryAddress}
                    weeklyCap="500.00"
                    totalProposals={totalProposals}
                  />
                } 
              />
              <Route 
                path="/proposals" 
                element={<ProposalPage />} 
              />
              <Route 
                path="/status" 
                element={
                  <StatusPage 
                    ownerAddress={ownerAddress} 
                    connectWallet={connectWallet}
                    walletClient={walletClient}
                    isConfigured={isConfigured}
                    setIsConfigured={setIsConfigured}
                    treasuryAddress={treasuryAddress}
                    setTreasuryAddress={setTreasuryAddress}
                  />
                } 
              />
              <Route 
                path="/stats" 
                element={<StatsPage />} 
              />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
