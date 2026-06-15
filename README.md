# Siggy: The AI Treasury Council 🛡️🤖

**Siggy** is an Autonomous AI spending council governed by three specialized AI agents on the GenLayer Studionet, paired with a MetaMask EOA Treasury on Base Sepolia. It leverages gasless **ERC-7710/7715 transaction delegation** via the **1Shot Relayer** to execute treasury payouts without requiring direct user signatures for every transaction.

---

## 🚀 The Vision

Traditional DAO spending councils suffer from high operational overhead, voter apathy, slow reaction times, and significant gas costs. Siggy introduces **Optimistic AI Democracy**:
1. **Intelligent Governance:** Proposals are reviewed by three consensus-driven AI agent personas—**The Skeptic**, **The Strategist**, and **The Ethicist**—deployed directly as a GenLayer Intelligent Contract.
2. **Gasless Session Execution:** Approved payouts are dispatched gaslessly on Base Sepolia using MetaMask's Hybrid Smart Account architecture and the 1Shot Relayer. This enables automated, instant execution with full non-custodial authorization.

---

## 🤖 Why GenLayer as the AI Layer?

Unlike traditional AI integrations that rely on centralized API servers (which can be tampered with, censored, or shut down), Siggy utilizes **GenLayer** to ensure trustless, decentralized, and consensus-driven AI decision-making:
- **Trustless & Censorship-Resistant Execution:** The evaluation prompts are executed directly on-chain by the GenLayer validator network. No centralized backend or API gateway can override, alter, or manipulate the AI council's verdicts.
- **Consensus via Diverse Personas:** Siggy deploys three distinct validator-run AI council personas—The Skeptic, The Strategist, and The Ethicist. A majority consensus is required on-chain before any treasury funds can be unlocked.
- **Deterministic Equivalence Principle:** To resolve the challenge of non-deterministic LLM outputs (which typically break blockchain consensus), Siggy enforces a custom validation strategy where validators verify the structural boundaries and limits of the payout rather than requiring identical textual reasoning, guaranteeing a finalized transaction state.

---

## 🛠️ Key Innovation & Technical Pillars

### 1. GenLayer Intelligent Contract (Studionet)
Deployed at: `0x7e202c68476b2BfA28214826AC8A0a051766a5D5` (Chain ID `61999`)
- **Non-Deterministic Consensus:** The council agents evaluate proposals using GenVM's native `gl.nondet.exec_prompt()`.
- **Equivalence Principle:** To prevent validator consensus divergence (where validators get different text answers, causing validation failure), Siggy enforces a validator strategy. The validator verifies the proposed schema, bounds, and requested amount limits instead of re-running non-deterministic prompts. This ensures consensus finalizes reliably with `MAJORITY_AGREE`.
- **Weekly Spending Cap:** Enforces a limit of **500 USDC** on weekly discretionary spending. Any proposal exceeding the weekly limit is automatically rejected by the AI agents.

### 2. EVM Treasury EOA & EIP-7715 Delegation
- **Treasury Address (EOA):** Managed directly by the DAO admin EOA address `0xEd9EDd8586b20524CafA4F568413C504C9B03172` acting as the treasury.
- **Administrative Delegation:** The admin grants a periodic token spending delegation (ERC-7715) to a locally generated **Council Executor session/burner key** (`0x9d229da88714D78C43E2298Ccb8432946CC9810F`).
- **MetaMask EOA & EIP-7715 Permissions:** Since the treasury is managed by the owner EOA `0xEd9EDd8586b20524CafA4F568413C504C9B03172`, the application requests permissions natively via MetaMask's EIP-7715 `wallet_requestExecutionPermissions` API targeting the EOA. This natively prompts the user to delegate periodic USDC spending permissions to the Council Executor session key.
- **Signature Registration:** The signed delegation signature payload is registered on the GenLayer contract (`register_delegation`), making it retrievable by any authorized client executing a payout.

### 3. Gasless 1Shot Relayer Dispatcher (ERC-7710)
- **1Shot API Endpoint:** `https://relayer.1shotapi.dev/relayers` (Chain ID `84532`)
- **Gasless Payments:** Once a proposal is approved on GenLayer, the execution client grabs the registered delegation signature, estimates gas costs in USDC, bundles a fee payment to the relayer along with the recipient transfer, and submits it to the 1Shot Relayer. The transaction executes gaslessly, paid directly from the treasury's USDC balance.

### 4. Payout Reliability & Double-Spend Protection
- **Pre-flight Status Validation:** Prior to initiating the gasless relayer flow, the frontend performs a real-time query (`getProposal`) to verify that the proposal's on-chain status is still `approved` (and not already `executed`).
- **Pre-flight USDC Balance Check:** The frontend queries the treasury's USDC balance via `publicClient.readContract` prior to estimation. It verifies that the treasury contains enough USDC to cover both the payout amount and a `0.05 USDC` buffer for relayer fees. If insufficient, it blocks the payout and displays a clear message to prevent relayer-side reverts.
- **Relayer Estimation Validation:** Robust response validations protect `estimate7710Transaction` results. If the 1Shot Relayer returns empty results or error fields (such as chain support mismatches), the DApp catches it and outputs a descriptive log in the console instead of crashing.
- **Double-click Prevention:** An active proposal execution tracking state `executingPids` disables the execution buttons and blocks duplicate execution requests while a payout transaction is actively being estimated, signed, or relayed.
- **EIP-7710 Nested Execution Bundles:** Transaction payloads compile all transfer executions (for recipient payout and relayer gas fee) into a nested `executions` list under a single EIP-7715 delegation `permissionContext`, adhering directly to the EIP-7710 specification.
- **1Shot Dynamic Delegate Targeting:** EIP-7715 delegation permissions requested via MetaMask now dynamically target the relayer's dynamic `targetAddress` (delegate) fetched from `relayer_getCapabilities`. This authorizes the relayer to redeem the delegation context and execute the payout on-chain.
- **EIP-7715 Property Aliasing:** The relayer client enriches delegation objects with Biconomy-compatible aliases (`delegator = from` and `delegate = to`), preventing internal address verification failures (such as Ethers.js `invalid address (argument="address", value=null)`) on the relayer backend.

---

## 📂 Project Architecture

```mermaid
graph TD
    A[Admin Owner EOA] -->|Acting directly as| B[EVM Treasury EOA]
    A -->|Grants ERC-7715 spending limit| C[Council Executor Burner Key]
    A -->|Registers Signature Payload| D[GenLayer Intelligent Contract]
    
    SubGraph GenLayer Studionet
        D -->|Evaluate Proposal| E[AI Council Agents]
        E -->|The Skeptic| F[Analyze Risk & Reputation]
        E -->|The Strategist| G[Analyze Growth & ROI]
        E -->|The Ethicist| H[Analyze Mission & Cap]
        F & G & H -->|Deterministic Validator Consensus| I[Consensus Approved/Rejected]
    End
    
    SubGraph Base Sepolia Testnet
        J[Web App Client] -->|Fetch Approved Proposal & Delegation| D
        J -->|Bundle transfer & fee| K[1Shot Relayer]
        K -->|Gasless execution via delegation| B
        B -->|Payout USDC| L[Recipient Wallet]
    End
```

---

## 📜 Intelligent Contract Architecture

The contract is written in Python for the GenLayer GenVM. It is located in [`contracts/genlayer/treasury_council.py`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/contracts/genlayer/treasury_council.py).

---

## 🎨 Frontend Web Console Features

The frontend is built using **Vite + React + TypeScript + Vanilla CSS**, styled with a premium retro-terminal / matrix green theme to fit the developer console vibe.

1. **Dashboard & Status Panel (`/`):**
   - Connects the admin EOA wallet.
   - Loads active USDC/ETH balances on Base Sepolia.
   - Manages ERC-7715 delegation creation and registers it on-chain to GenLayer.
2. **Dedicated Proposal Evaluation Workspace (`/evaluate`):**
   - **Active Queue (`ACTIVE_EVALUATION_QUEUE.LST`):** Lists only pending and approved proposals awaiting review.
   - **AI Agent Verdict Visualizer:** Renders the 3 AI Council personas (The Skeptic, The Strategist, and The Ethicist) as cards.
   - **On-Chain AI Consensus Trigger:** Triggers GenLayer Studionet contract evaluation.
   - **Gasless Payout Release:** For approved proposals, the admin clicks **RELEASE FUNDS FROM TREASURY**. It fetches the ERC-7715 delegation, calculates gas fees, compiles the work and relayer fee transactions, and dispatches the bundle via the 1Shot Relayer, showing step-by-step transaction logs in real time.
3. **Dedicated Proposal History Registry (`/history`):**
   - Displays all historical records of proposals.
4. **Interactive Onboarding Tutorial Guide (`SIGGY_GUIDE.EXE`):**
   - A floating, themed assistant card in the bottom-right corner.
5. **Post-Submission Prompt Modal:**
   - After a new proposal is successfully recorded on the GenLayer network, the screen dims and displays a terminal-styled popup prompt.

---

## ⚙️ Configuration & Environment Setup

1. **Prerequisites:**
   - Node.js (v20+ recommended)
   - MetaMask Wallet extension
   - Base Sepolia testnet USDC tokens (Fund your EOA treasury address)

2. **Environment Variables:**
   Create a `.env` file in the root folder with the following variables:
   ```env
   VITE_USDC_TOKEN_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
   VITE_RELAYER_URL=https://relayer.1shotapi.dev/relayers
   VITE_GENLAYER_CHAIN_ID=61999
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

---

## 💎 Judge Testing Guide (Step-by-Step E2E)

1. **Retrieve the Deployed Addresses:**
   - **GenLayer Studionet Contract:** `0x7e202c68476b2BfA28214826AC8A0a051766a5D5`
   - **Council Session/Burner Address:** `0x9d229da88714D78C43E2298Ccb8432946CC9810F`
   - **Base Sepolia USDC Token:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

2. **Access the Config Panel:**
   - Connect your MetaMask Admin EOA `0xEd9EDd8586b20524CafA4F568413C504C9B03172`.
   - The interface registers the EOA as the **Treasury Address**.
   - Fund your EOA with Base Sepolia testnet USDC tokens.

3. **Grant ERC-7715 Delegation:**
   - Click **GRANT DELEGATION (ERC-7715)**.
   - MetaMask opens a permission dialog requesting authorization to delegate a weekly limit of 500 USDC to the local burner account.
   - Approve the dialog. The signature bundle is automatically registered on-chain to GenLayer.

4. **Submit a Proposal:**
   - Go to the **Proposal Page**.
   - Input a title, strategic description, recipient address, and requested amount (e.g., 20 USDC).
   - Click **SUBMIT PROPOSAL**. This records the pending proposal on GenLayer.

5. **Trigger AI Council Evaluation:**
   - Go to the council chamber console and trigger the consensus evaluation.
   - Once approved, click **RELEASE FUNDS FROM TREASURY**.
   - The application fetches the registered signature payload from GenLayer and sends the transaction bundle to the 1Shot Relayer.
   - The 1Shot Relayer dispatches the transaction on Base Sepolia. The funds are transferred, and the fee is sponsored in USDC gaslessly.

---

## 🌐 Live Deployments & Key Details

- **Production Frontend URL:** [https://siggy-treasury.vercel.app](https://siggy-treasury.vercel.app)
- **GenLayer Studionet Contract:** `0x7e202c68476b2BfA28214826AC8A0a051766a5D5` (Chain ID `61999`)
- **Treasury Address (EOA):** `0xEd9EDd8586b20524CafA4F568413C504C9B03172` (Base Sepolia, Chain ID `84532`)
- **USDC Token Address (Base Sepolia):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Council Session/Burner Address:** `0x9d229da88714D78C43E2298Ccb8432946CC9810F`
- **1Shot Relayer URL:** `https://relayer.1shotapi.dev/relayers`

---

## 🏆 Hackathon Submission Tracks & Code Links

### 1. Smart Accounts Kit Usage
- Initialize Hybrid Smart Account: [`src/lib/delegation.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/delegation.ts#L24-L32)

### 2. Advanced Permissions
- Bypassed (We use native ERC-7715 delegations instead of custom advanced permissions).

### 3. Delegations
- Create ERC-7715 Delegation: [`src/pages/StatusPage.tsx`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/pages/StatusPage.tsx#L133-L144) and [`src/lib/delegation.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/delegation.ts#L35-L75)
- Redeeming Delegation via Relayer: [`src/pages/EvaluationPage.tsx`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/pages/EvaluationPage.tsx#L340-L348) and [`src/lib/relayer.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/relayer.ts#L168-L203)

### 4. Redelegation
- Burner-to-Relayer Redelegation: [`src/pages/EvaluationPage.tsx`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/pages/EvaluationPage.tsx#L237-L262)

### 5. x402
- Not used in this project.

### 6. 1Shot API Usage
- Estimate 7710 Transaction: [`src/lib/relayer.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/relayer.ts#L135-L166)
- Send 7710 Transaction: [`src/lib/relayer.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/relayer.ts#L168-L203)
- Polling transaction status: [`src/lib/relayer.ts`](file:///c:/Users/Tech%20Shine/Documents/Siggy%20Treasury/src/lib/relayer.ts#L205-L248)

---

## 💬 Feedback

### MetaMask Smart Accounts SDK
- **Integration experience:** The `@metamask/smart-accounts-kit` provides a robust wrapper around smart account generation, but is currently restrictive regarding EOA execution bounds when calling `requestExecutionPermissions` (throwing `"Requested address not found"` for counterfactual smart wallets). We resolved this by falling back to standard EOA delegations (where EOA acts directly as the delegator) which MetaMask handles beautifully and natively.
- **Documentation:** More clarity is needed on how to construct EIP-7715 context objects manually when bypassing standard kit flows.

### 1Shot API
- **Developer Experience:** The gasless relayer is extremely fast and reliable. The JSON-RPC interfaces (`relayer_estimate7710Transaction` and `relayer_send7710Transaction`) map perfectly to standard EIP-7710 transaction flows.
- **Suggestion:** Returning clearer error traces or codes instead of general `"execution reverted"` when validation fails (e.g. caveat limit exceeded) would greatly improve debugging speed.
