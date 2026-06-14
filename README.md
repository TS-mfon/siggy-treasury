# Siggy: The AI Treasury Council 🛡️🤖

**Siggy** is an Autonomous AI spending council governed by three specialized AI agents on the GenLayer Studionet, paired with a counterfactual MetaMask Hybrid Smart Account on Base Sepolia. It leverages gasless **ERC-7710/7715 transaction delegation** via the **1Shot Relayer** to execute treasury payouts without requiring direct user signatures for every transaction.

---

## 🚀 The Vision

Traditional DAO spending councils suffer from high operational overhead, voter apathy, slow reaction times, and significant gas costs. Siggy introduces **Optimistic AI Democracy**:
1. **Intelligent Governance:** Proposals are reviewed by three consensus-driven AI agent personas—**The Skeptic**, **The Strategist**, and **The Ethicist**—deployed directly as a GenLayer Intelligent Contract.
2. **Gasless Session Execution:** Approved payouts are dispatched gaslessly on Base Sepolia using MetaMask's Hybrid Smart Account architecture and the 1Shot Relayer. This enables automated, instant execution with full non-custodial authorization.

---

## 🛠️ Key Innovation & Technical Pillars

### 1. GenLayer Intelligent Contract (Studionet)
Deployed at: `0xb18D9EB0EF7f1b3A55C54AB01CAB8a6894b9c5D3` (Chain ID `61999`)
- **Non-Deterministic Consensus:** The council agents evaluate proposals using GenVM's native `gl.nondet.exec_prompt()`.
- **Equivalence Principle:** To prevent validator consensus divergence (where different validators query the LLM and get varying text, resulting in validation failure), Siggy enforces a deterministic validator strategy (`validator_fn`). The validator verifies the proposed schema, bounds, and requested amount limits instead of re-running non-deterministic prompts. This ensures consensus finalizes reliably with `MAJORITY_AGREE`.
- **Weekly Spending Cap:** Enforces a minimum cap of **500 USDC** on weekly discretionary spending. Any proposal exceeding the weekly limit is automatically rejected by the AI agents.

### 2. MetaMask Hybrid Smart Account & ERC-7715 Delegation
- **Counterfactual Smart Wallet:** Generates a Hybrid smart account for the DAO admin EOA on Base Sepolia via `@metamask/smart-accounts-kit`.
- **Administrative Delegation:** The admin grants a periodic token spending delegation (ERC-7715) to a locally generated **Council Executor session/burner key** (`0xEd9EDd8586b20524CafA4F568413C504C9B03172`).
- **Signature Registration:** The signed delegation signature payload is registered on the GenLayer contract (`register_delegation`), making it retrievable by any authorized client executing a payout.

### 3. Gasless 1Shot Relayer Dispatcher (ERC-7710)
- **1Shot API Endpoint:** `https://relayer.1shotapi.com/relayers` (Chain ID `84532`)
- **Gasless Payments:** Once a proposal is approved on GenLayer, the execution client grabs the registered delegation signature, estimates gas costs in USDC, bundles a fee payment to the relayer along with the recipient transfer, and submits it to the 1Shot Relayer. The transaction executes gaslessly, paid directly from the treasury's USDC balance.

---

## 📂 Project Architecture

```mermaid
graph TD
    A[Admin Owner EOA] -->|Connects & Computes| B[MetaMask Hybrid Smart Account]
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

### Core Data Structures
- **`AgentVerdict`**: Tracks the vote, confidence level (0-100), max approved amount, and strategic reasoning of each agent persona.
- **`Proposal`**: Tracks the strategic description, category, requested amount, recipient address, consensus status (`pending`, `approved`, `rejected`, `executed`), final combiner reasoning, EVM transaction hash, and individual agent verdicts.

### Key Contract Functions
- `register_delegation(delegation_payload, treasury_address, token_address, executor_address)`: Allows the owner to register the ERC-7715 authorization bundle.
- `submit_proposal(title, description, category, recipient, requested_amount_micro)`: Submits a spending request to the DAO.
- `evaluate_proposal(pid)`: Triggers GenLayer consensus. Validators execute the non-deterministic evaluations for the 3 agents, combine the results, enforce the weekly cap limit, and output a consensus verdict.
- `mark_executed(pid, tx_hash)`: Invoked by the executor after dispatching the 1Shot gasless payout transaction to mark the proposal as paid.

---

## 🎨 Frontend Web Console

Built using **Vite + React + TypeScript + Vanilla CSS**, styled with a premium retro-terminal / matrix green theme to fit the developer console vibe.

- **Status Panel:** Connects the admin wallet, calculates the counterfactual smart account address, loads active USDC/ETH balances on Base Sepolia, requests ERC-7715 delegation, and registers it to the GenLayer contract.
- **Proposal Console:** Submit spending requests, run AI evaluations on Studionet, review consensus verdicts, and execute gasless payments via the 1Shot Relayer.
- **Analytics & History:** Reviews total distributed funds, council consensus efficiency, relayer endpoint configurations, and logs executed transactions with active Base Scan links.

---

## ⚙️ Configuration & Environment Setup

1. **Prerequisites:**
   - Node.js (v20+ recommended)
   - MetaMask Wallet extension
   - Base Sepolia testnet USDC tokens (Fund your counterfactual smart account address)

2. **Environment Variables:**
   Create a `.env` file in the root folder with the following variables:
   ```env
   VITE_USDC_TOKEN_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
   VITE_RELAYER_URL=https://relayer.1shotapi.com/relayers
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

To thoroughly evaluate the Siggy prototype:

1. **Retrieve the Deployed Addresses:**
   - **GenLayer Studionet Contract:** `0xb18D9EB0EF7f1b3A55C54AB01CAB8a6894b9c5D3`
   - **Council Session/Burner Address:** `0xEd9EDd8586b20524CafA4F568413C504C9B03172`
   - **Base Sepolia USDC Token:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

2. **Access the Config Panel:**
   - Connect your MetaMask Admin EOA.
   - The interface computes the counterfactual **Treasury Smart Account Address**.
   - Copy this address and send Base Sepolia testnet USDC to it (needs at least some USDC to execute payouts and pay the relayer's USDC-sponsored gas fee).

3. **Grant ERC-7715 Delegation:**
   - Click **GRANT DELEGATION (ERC-7715)**.
   - MetaMask will open a permission dialog requesting authorization to delegate a weekly limit of 500 USDC to the local burner account.
   - Approve the dialog. The signature bundle is automatically serialized and sent via a GenLayer transaction to register the delegation on-chain.

4. **Submit a Proposal:**
   - Go to the **Proposal Page**.
   - Input a title, strategic description, recipient address, and requested amount (e.g., 20 USDC).
   - Click **SUBMIT PROPOSAL**. This records the pending proposal on GenLayer.

5. **Trigger AI Council Evaluation:**
   - Expand the proposal and click **RUN COUNCIL EVALUATION**.
   - The contract's 3 agent personas execute prompts to review risk, roadmaps, and ethics.
   - Once consensus finalizes on GenLayer, the proposal state changes to `approved` (if it passes and does not exceed the weekly cap limit).

6. **Execute Gasless Payout:**
   - Click **EXECUTE PAYOUT**.
   - The application fetches the registered signature payload from GenLayer and sends the transaction bundle to the 1Shot Relayer.
   - The 1Shot Relayer dispatches the transaction on Base Sepolia. The funds are transferred, and the fee is sponsored in USDC gaslessly.
   - The frontend polls the tx, confirms it, and marks the proposal as `executed` on GenLayer with the Base Scan transaction link!
