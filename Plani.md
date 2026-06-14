# AI Treasury Council — Build Plan
**MetaMask Smart Accounts Kit x 1Shot API x GenLayer**

A mini-DAO treasury that funds itself once via an on-chain delegation, then runs autonomously: members submit spending proposals, a 3-persona AI council on GenLayer evaluates and reaches consensus, and approved payouts execute gaslessly through 1Shot's Permissionless Relayer — no human re-signs anything after the initial setup, no backend server.

---

## 1. Core Concept

| Layer | Role | Tech |
|---|---|---|
| Decision layer | 3 AI personas evaluate proposals, reach consensus on approve/reject + amount | GenLayer Intelligent Contract |
| Permission layer | DAO grants a capped, time-windowed spending permission ONCE | MetaMask Smart Accounts Kit (ERC-7715 / ERC-7710) |
| Execution layer | Approved payouts execute gaslessly against that permission | 1Shot Permissionless Relayer |
| Glue | Reads GenLayer state, drives ERC-7715 grant flow, drives 1Shot calls | React frontend, no server |

The "magic moment" for the demo: a DAO member submits a funding request, clicks "Run Council," watches three AI personas debate and vote on-chain, and — if approved — the USDC lands in the recipient's wallet with **zero additional signatures and zero gas paid by anyone in that flow**.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Vite)                      │
│  - Connect wallet (any signer, via Smart Accounts Kit)            │
│  - One-time setup screen: create Treasury Smart Account,          │
│    grant ERC-7715 erc20PeriodTransfer permission                  │
│  - Proposal form (title, description, category, recipient, amount)│
│  - Council dashboard: live verdicts from GenLayer                 │
│  - "Execute Payout" → 1Shot relayer call                          │
└───────────┬─────────────────────────────────┬─────────────────────┘
            │ genlayer-js (read/write)         │ viem + delegation-toolkit
            ▼                                  │ + 1Shot JSON-RPC
┌───────────────────────────────┐             ▼
│  GenLayer Intelligent Contract │   ┌─────────────────────────────────┐
│  "TreasuryCouncil"             │   │  EVM Chain: Base Sepolia          │
│  - proposals: TreeMap          │   │  - Treasury Smart Account         │
│  - mission_statement, caps     │   │    (MetaMask Smart Account,       │
│  - 3-agent council:            │   │     holds test USDC)              │
│    Treasurer / Auditor /       │   │  - ERC-7715 delegation →           │
│    Strategist                  │◄──┤    Council Executor session acct  │
│  - deterministic consensus     │   │    (erc20PeriodTransfer scope)    │
│    combiner + cap enforcement  │   │  - 1Shot Permissionless Relayer   │
│  - delegation registry (stores │   │    redeems delegation → USDC      │
│    serialized permission JSON) │   │    transfer to recipient, gas paid│
└─────────────────────────────────┘   │    in USDC by relayer mechanics  │
                                       └─────────────────────────────────┘
```

**Why GenLayer holds the delegation JSON too:** it becomes the single source of truth — anyone loading the frontend can read the proposal queue, verdicts, AND the permission needed to execute, with no off-chain storage.

---

## 3. Stack Choices

- **EVM chain:** Base Sepolia (testnet) — confirmed in 1Shot's relayer examples; verify it's in `relayer_getCapabilities` response before committing.
- **Treasury token:** Testnet USDC on Base Sepolia (atto-scale internally, i.e. `amount * 10^6` since USDC has 6 decimals — note this differs from the 10^18 convention, handle carefully).
- **MetaMask Smart Accounts Kit:** `@metamask/delegation-toolkit` (the toolkit was renamed "Smart Accounts Kit" — pin a version and check current package name at build time) + `erc7715ProviderActions` via viem for the permission grant.
- **1Shot Permissionless Relayer:** JSON-RPC at `https://relayer.1shotapi.com/relayers`. Install the skill: `npx skills add 1Shot-API/skills/public-relayer`.
- **GenLayer:** Python intelligent contract on the GenLayer testnet (Asimov), `genlayer-js` SDK for frontend reads/writes.
- **Frontend:** React + Vite + viem. No backend, no database.

---

## 4. GenLayer Contract — `treasury_council.py`

### 4.1 Storage Design

```python
# { "Depends": "py-genlayer:test" }

from genlayer import *
from dataclasses import dataclass
import json, re

ERROR_EXPECTED  = "[EXPECTED]"
ERROR_LLM       = "[LLM_ERROR]"

@allow_storage
@dataclass
class AgentVerdict:
    persona: str            # "treasurer" | "auditor" | "strategist"
    vote: str               # "approve" | "reject"
    confidence: u256        # 0-100
    max_amount_micro: u256  # USDC, 6-decimal atomic units
    reasoning: str

@allow_storage
@dataclass
class Proposal:
    id: u256
    proposer: str                # address string
    title: str
    description: str
    category: str                # "grant" | "contributor" | "infra" | "marketing" | "other"
    recipient: str                # address string
    requested_amount_micro: u256
    status: str                   # "pending" | "approved" | "rejected" | "executed"
    approved_amount_micro: u256
    final_reasoning: str
    created_at: str
    tx_hash: str
    treasurer_verdict: AgentVerdict
    auditor_verdict: AgentVerdict
    strategist_verdict: AgentVerdict

class TreasuryCouncil(gl.Contract):
    owner: Address
    mission_statement: str
    weekly_cap_micro: u256
    spent_this_period_micro: u256
    period_start: str            # ISO date string
    proposals: TreeMap[u256, Proposal]
    proposal_count: u256

    # delegation registry — written once during setup
    delegation_payload: str      # serialized ERC-7710 permission/delegation JSON
    treasury_address: str
    token_address: str           # USDC on Base Sepolia
    executor_address: str        # council session account address

    def __init__(self, mission_statement: str, weekly_cap_micro: u256):
        self.owner = gl.message.sender_account
        self.mission_statement = mission_statement
        self.weekly_cap_micro = weekly_cap_micro
        self.spent_this_period_micro = u256(0)
        self.period_start = "2026-06-13"
        self.proposal_count = u256(0)
        self.delegation_payload = ""
        self.treasury_address = ""
        self.token_address = ""
        self.executor_address = ""
```

### 4.2 Setup / Registration (one-time, owner-only)

```python
    @gl.public.write
    def register_delegation(
        self, delegation_payload: str, treasury_address: str,
        token_address: str, executor_address: str
    ) -> None:
        if gl.message.sender_account != self.owner:
            raise gl.UserError(f"{ERROR_EXPECTED} Only owner")
        self.delegation_payload = delegation_payload
        self.treasury_address = treasury_address
        self.token_address = token_address
        self.executor_address = executor_address

    @gl.public.view
    def get_execution_context(self) -> dict:
        return {
            "delegation_payload": self.delegation_payload,
            "treasury_address": self.treasury_address,
            "token_address": self.token_address,
            "executor_address": self.executor_address,
            "weekly_cap_micro": self.weekly_cap_micro,
            "spent_this_period_micro": self.spent_this_period_micro,
        }
```

### 4.3 Submit Proposal

```python
    @gl.public.write
    def submit_proposal(
        self, title: str, description: str, category: str,
        recipient: str, requested_amount_micro: u256
    ) -> u256:
        pid = self.proposal_count
        empty_verdict = AgentVerdict(persona="", vote="", confidence=u256(0),
                                       max_amount_micro=u256(0), reasoning="")
        self.proposals[pid] = Proposal(
            id=pid,
            proposer=str(gl.message.sender_account),
            title=title, description=description, category=category,
            recipient=recipient, requested_amount_micro=requested_amount_micro,
            status="pending", approved_amount_micro=u256(0),
            final_reasoning="", created_at="2026-06-13", tx_hash="",
            treasurer_verdict=empty_verdict, auditor_verdict=empty_verdict,
            strategist_verdict=empty_verdict,
        )
        self.proposal_count += u256(1)
        return pid

    @gl.public.view
    def get_proposal(self, pid: u256) -> dict:
        p = self.proposals[pid]
        return {
            "id": p.id, "title": p.title, "description": p.description,
            "category": p.category, "recipient": p.recipient,
            "requested_amount_micro": p.requested_amount_micro,
            "status": p.status, "approved_amount_micro": p.approved_amount_micro,
            "final_reasoning": p.final_reasoning, "tx_hash": p.tx_hash,
            "verdicts": [
                {"persona": v.persona, "vote": v.vote, "confidence": v.confidence,
                 "max_amount_micro": v.max_amount_micro, "reasoning": v.reasoning}
                for v in (p.treasurer_verdict, p.auditor_verdict, p.strategist_verdict)
            ],
        }
```

### 4.4 The Council — Three Personas

Each persona is an independent LLM call wrapped in `gl.vm.run_nondet_unsafe` with a **custom validator function** (per the equivalence-principle decision tree: LLM output → never `strict_eq`). The validator re-runs the same prompt and checks `vote` matches exactly and `confidence`/`max_amount` are within tolerance — this is the gate-check + tolerance pattern.

```python
    def _persona_prompt(self, persona: str, p: Proposal) -> str:
        base = f"""You are evaluating a DAO treasury spending proposal.
DAO mission: {self.mission_statement}
Weekly cap remaining: {self.weekly_cap_micro - self.spent_this_period_micro} (USDC micro-units)

Proposal:
- Title: {p.title}
- Category: {p.category}
- Description: {p.description}
- Recipient: {p.recipient}
- Requested amount (USDC micro-units): {p.requested_amount_micro}

Respond ONLY as JSON: {{"vote": "approve"|"reject", "confidence": 0-100,
"max_amount_micro": <int>, "reasoning": "<2-3 sentences>"}}
max_amount_micro is the MOST you'd approve, which may be less than requested."""

        personas = {
            "treasurer": "Persona: THE TREASURER. Focus strictly on budget health: "
                         "is this amount reasonable for the category, does it fit "
                         "within remaining weekly cap, any runway risk?",
            "auditor": "Persona: THE AUDITOR. Focus strictly on red flags: vague "
                       "descriptions, mismatched category/amount, suspicious or "
                       "unverifiable recipients, signs of duplication or abuse. "
                       "Be skeptical by default.",
            "strategist": "Persona: THE STRATEGIST. Focus strictly on mission "
                          "alignment: does this proposal advance the DAO's stated "
                          "mission, and is the expected impact worth the spend?",
        }
        return personas[persona] + "\n\n" + base

    def _parse_verdict(self, raw, persona: str, requested: u256) -> AgentVerdict:
        if not isinstance(raw, dict):
            raise gl.vm.UserError(f"{ERROR_LLM} Non-dict response: {type(raw)}")
        vote = str(raw.get("vote", "")).strip().lower()
        if vote not in ("approve", "reject"):
            raise gl.vm.UserError(f"{ERROR_LLM} Invalid vote: {vote}")
        try:
            confidence = max(0, min(100, int(round(float(raw.get("confidence", 0))))))
            max_amt = max(0, int(round(float(raw.get("max_amount_micro", 0)))))
        except (ValueError, TypeError):
            raise gl.vm.UserError(f"{ERROR_LLM} Non-numeric fields")
        if vote == "approve":
            max_amt = min(max_amt, int(requested))
        else:
            max_amt = 0
        return AgentVerdict(
            persona=persona, vote=vote, confidence=u256(confidence),
            max_amount_micro=u256(max_amt), reasoning=str(raw.get("reasoning", ""))[:400],
        )

    def _evaluate_persona(self, persona: str, p: Proposal) -> AgentVerdict:
        prompt = self._persona_prompt(persona, p)

        def leader_fn():
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return self._parse_verdict(raw, persona, p.requested_amount_micro)

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                # error-path comparison omitted for brevity — see skill's
                # _handle_leader_error canonical pattern
                return False
            v = leaders_res.calldata
            check = leader_fn()
            if v["vote"] != check.vote:
                return False
            # confidence tolerance: +/- 25 points
            if abs(int(v["confidence"]) - int(check.confidence)) > 25:
                return False
            # max_amount tolerance: within 2x / 0.5x (skip if both zero)
            la, ca = int(v["max_amount_micro"]), int(check.max_amount_micro)
            if la == 0 and ca == 0:
                return True
            if la == 0 or ca == 0:
                return False
            ratio = la / ca
            return 0.5 <= ratio <= 2.0

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        return result
```

### 4.5 Evaluate Proposal — Consensus Combiner

The three LLM calls are each individually consensus-validated above. The **combination logic is deterministic** (no eq_principle needed):

```python
    @gl.public.write
    def evaluate_proposal(self, pid: u256) -> dict:
        p = self.proposals[pid]
        if p.status != "pending":
            raise gl.UserError(f"{ERROR_EXPECTED} Proposal not pending")

        treasurer = self._evaluate_persona("treasurer", p)
        auditor = self._evaluate_persona("auditor", p)
        strategist = self._evaluate_persona("strategist", p)
        verdicts = [treasurer, auditor, strategist]

        approve_votes = sum(1 for v in verdicts if v.vote == "approve")
        approving_caps = [int(v.max_amount_micro) for v in verdicts if v.vote == "approve"]

        if approve_votes >= 2:
            approved_amount = min(int(p.requested_amount_micro), min(approving_caps))
            remaining = int(self.weekly_cap_micro) - int(self.spent_this_period_micro)
            if approved_amount > remaining:
                p.status = "rejected"
                p.final_reasoning = (
                    f"Council approved {approve_votes}/3, but {approved_amount} "
                    f"exceeds remaining weekly cap of {remaining}."
                )
            else:
                p.status = "approved"
                p.approved_amount_micro = u256(approved_amount)
                p.final_reasoning = (
                    f"Council approved {approve_votes}/3 votes. "
                    f"Approved amount: {approved_amount} micro-USDC."
                )
        else:
            p.status = "rejected"
            p.final_reasoning = f"Council rejected: only {approve_votes}/3 votes to approve."

        p.treasurer_verdict = treasurer
        p.auditor_verdict = auditor
        p.strategist_verdict = strategist
        self.proposals[pid] = p

        return {"status": p.status, "approved_amount_micro": p.approved_amount_micro,
                "final_reasoning": p.final_reasoning}
```

### 4.6 Mark Executed (called by frontend after 1Shot confirms)

```python
    @gl.public.write
    def mark_executed(self, pid: u256, tx_hash: str) -> None:
        p = self.proposals[pid]
        if p.status != "approved":
            raise gl.UserError(f"{ERROR_EXPECTED} Proposal not approved")
        p.status = "executed"
        p.tx_hash = tx_hash
        self.proposals[pid] = p
        self.spent_this_period_micro += p.approved_amount_micro

    @gl.public.view
    def get_pending_executions(self) -> list:
        out = []
        for pid in range(int(self.proposal_count)):
            p = self.proposals[u256(pid)]
            if p.status == "approved":
                out.append({"id": int(p.id), "recipient": p.recipient,
                             "amount_micro": int(p.approved_amount_micro)})
        return out
```

---

## 5. MetaMask Smart Accounts Kit — Delegation Setup (one-time script)

This runs **once**, by the DAO admin, via a small script + the MetaMask extension. It is the only point in the whole system where a human signs anything related to fund movement.

### 5.1 Create the Treasury Smart Account

```ts
import { toMetaMaskSmartAccount, Implementation } from "@metamask/delegation-toolkit";
import { createWalletClient, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

// owner = the DAO admin's EOA (MetaMask)
const treasuryAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid, // or current default per kit docs
  deployParams: [ownerAddress, [], [], []],
  deploySalt: "0x" + "0".repeat(64),
  signer: { walletClient }, // MetaMask EOA signer
});
// → fund treasuryAccount.address with testnet USDC
```

### 5.2 Generate the Council Executor session account

```ts
import { privateKeyToAccount } from "viem/accounts";
// Generate fresh, store the private key in frontend .env for the demo.
// NOTE: this is a hackathon-scoped simplification — production would use
// a smart-contract delegate (ERC-1271) rather than a raw burner key.
const executorAccount = privateKeyToAccount(generatePrivateKey());
```

### 5.3 Grant the ERC-7715 permission (erc20PeriodTransfer)

```ts
import { erc7715ProviderActions } from "@metamask/delegation-toolkit/experimental";
import { parseUnits } from "viem";

const walletClient = createWalletClient({
  chain: baseSepolia, transport: custom(window.ethereum),
}).extend(erc7715ProviderActions());

const weeklyCapUSDC = parseUnits("500", 6); // 500 USDC/week

const permissions = await walletClient.requestExecutionPermissions([{
  chainId: baseSepolia.id,
  account: treasuryAccount.address,
  signer: { type: "account", data: { address: executorAccount.address } },
  permission: {
    type: "erc20-token-periodic",
    data: {
      tokenAddress: USDC_BASE_SEPOLIA,
      periodAmount: weeklyCapUSDC,
      periodDuration: 60 * 60 * 24 * 7, // 7 days, seconds
      startTime: Math.floor(Date.now() / 1000),
    },
  },
}]);
```

> ⚠️ **Verify before building:** exact `permission.type` string (`erc20-token-periodic` vs `erc20PeriodTransfer` scope helper), and whether `createDelegation({ scope: { type: "erc20PeriodTransfer", ... } })` is the more current API for the Smart Accounts Kit version you install. Both achieve the same `erc20PeriodTransfer` + `valueLte` caveat enforcer combination — check `docs.metamask.io/smart-accounts-kit` for the version pinned in your `package.json`.

### 5.4 Register on GenLayer

```ts
import { createClient } from "genlayer-js";

const glClient = createClient({ /* network config */ });
await glClient.writeContract({
  address: TREASURY_COUNCIL_CONTRACT,
  function: "register_delegation",
  args: [
    JSON.stringify(permissions),       // serialized ERC-7715 permission/delegation
    treasuryAccount.address,
    USDC_BASE_SEPOLIA,
    executorAccount.address,
  ],
});
```

From this point on, **no further signatures from the DAO admin are needed** — the council operates purely on the GenLayer contract, and execution is driven by the Council Executor + 1Shot relayer.

---

## 6. 1Shot Relayer Integration — Execution Flow

Reference: `npx skills add 1Shot-API/skills/public-relayer`. JSON-RPC endpoint: `https://relayer.1shotapi.com/relayers`.

### 6.1 Step-by-step (per approved proposal)

1. **`relayer_getCapabilities`** — confirm Base Sepolia is supported, get `targetAddress` (must match the delegation `to`) and accepted fee tokens (USDC). Cache for the session.

```ts
const caps = await rpc("relayer_getCapabilities", ["84532"]); // Base Sepolia chainId
```

2. **Build the work transaction** — an ERC-20 `transfer(recipient, approved_amount)` call on USDC, executed via the registered ERC-7715 permission, signed by the Council Executor session account (`redeemDelegations` from the delegation toolkit).

3. **`relayer_estimate7710Transaction`** — pass the assembled bundle (fee execution placeholder + work execution) to get `requiredPaymentAmount`, `gasUsed`, and a signed `context` to lock the quote (~45s validity).

```ts
const estimate = await rpc("relayer_estimate7710Transaction", {
  chainId: "84532",
  token: USDC_BASE_SEPOLIA,
  transactions: [feeTransferTx, workTransferTx],
  delegation: signedDelegationBundle,
});
```

4. **`relayer_send7710Transaction`** — submit with the locked `context`, get back a `TaskId`.

```ts
const send = await rpc("relayer_send7710Transaction", {
  chainId: "84532",
  token: USDC_BASE_SEPOLIA,
  transactions: [feeTransferTx, workTransferTx],
  delegation: signedDelegationBundle,
  context: estimate.context,
});
const taskId = send.result;
```

5. **Poll `relayer_getStatus`** every 2-3s until `Confirmed` (or `Rejected`/`Reverted`).

```ts
let status;
do {
  await sleep(2500);
  status = await rpc("relayer_getStatus", [taskId]);
} while (status.result.status === "Pending" || status.result.status === "Submitted");
```

6. **On `Confirmed`** — call GenLayer `mark_executed(pid, txHash)` to close the loop and update the spending tracker.

### 6.2 Implementation checklist (from 1Shot docs)
- Use fresh delegation **salt** values every redemption to avoid replay collisions.
- Serialize bigint/byte values to hex before sending JSON-RPC payloads.
- Keep permission scope narrow — this is already enforced via `erc20-token-periodic` (amount + token + period).
- For the hackathon demo, polling `relayer_getStatus` is fine; skip webhooks.

---

## 7. End-to-End User Flows

### Flow A — One-time setup (admin)
1. Create Treasury Smart Account, fund with testnet USDC.
2. Generate Council Executor session account.
3. Grant ERC-7715 `erc20-token-periodic` permission (weekly cap) via MetaMask.
4. Register delegation + addresses on GenLayer (`register_delegation`).

### Flow B — Propose
1. Member connects wallet, fills proposal form.
2. Frontend calls `submit_proposal` → status `pending`.

### Flow C — Council evaluation
1. Anyone clicks "Run Council" on a pending proposal.
2. Frontend calls `evaluate_proposal(pid)`.
3. Contract runs Treasurer / Auditor / Strategist (each consensus-validated via custom validator function), combines votes deterministically, checks weekly cap.
4. Status → `approved` (with `approved_amount_micro`) or `rejected`. Verdicts + reasoning displayed per persona.

### Flow D — Execute
1. For `approved` proposals, frontend shows "Execute Payout."
2. Frontend reads `get_execution_context()` from GenLayer.
3. Frontend runs the 1Shot relayer flow (§6) to redeem the permission and transfer USDC to `recipient`.
4. On confirmation, frontend calls `mark_executed(pid, tx_hash)`.
5. UI shows the proposal as `executed` with a Base Sepolia explorer link.

---

## 8. Repo Structure

```
treasury-council/
├── plan.md
├── contracts/
│   └── genlayer/
│       └── treasury_council.py
├── scripts/
│   └── setup-treasury.ts        # Flow A — one-time delegation grant + registration
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/
│       │   ├── genlayer.ts      # genlayer-js client wrapper (read/write proposals)
│       │   ├── relayer.ts       # 1Shot JSON-RPC client (§6)
│       │   ├── delegation.ts    # serialize/deserialize ERC-7715 permission
│       │   └── constants.ts     # chain id, USDC address, contract address
│       └── components/
│           ├── SetupPanel.tsx       # Flow A UI (admin only)
│           ├── ProposalForm.tsx     # Flow B
│           ├── ProposalCard.tsx     # displays verdicts + status
│           ├── CouncilVerdicts.tsx  # 3-persona vote breakdown
│           └── TreasuryStatus.tsx   # weekly cap / spent this period
```

---

## 9. Build Schedule (targeting June 15, 2026 submission)

**Day 1 — June 13 (today)**
- Morning: scaffold `treasury_council.py` storage + `submit_proposal` / `get_proposal`. Lint with `genvm-lint check`.
- Afternoon: build `_evaluate_persona` for all three personas + `evaluate_proposal` combiner. Test in direct mode (business logic, no real consensus).
- Evening: deploy to GenLayer testnet, run integration test with real LLM calls for one proposal end-to-end.

**Day 2 — June 14**
- Morning: `setup-treasury.ts` — create Treasury Smart Account, fund with testnet USDC, generate executor account, grant ERC-7715 permission via MetaMask extension. Confirm Base Sepolia support in `relayer_getCapabilities`.
- Afternoon: `lib/relayer.ts` — capabilities → estimate → send → status poll, tested against a manual `evaluate_proposal` result.
- Evening: frontend skeleton — connect wallet, proposal form, proposal list reading from GenLayer.

**Day 3 — June 15 (submission day)**
- Morning: wire `CouncilVerdicts` + `TreasuryStatus` + "Execute Payout" button to live contract + relayer.
- Midday: full end-to-end run-through (submit → evaluate → approve → execute → mark_executed).
- Afternoon: record demo video (show MetaMask Smart Accounts Kit integration in the main flow per qualification rules), write README, deploy frontend (Vercel/Netlify).
- Submit.

---

## 10. Track Alignment

- **Best Agent** — the 3-persona council is an autonomous evaluator that reaches and acts on a verdict without human intervention after setup.
- **Best A2A Coordination** — frame the Treasurer/Auditor/Strategist as three independent agents whose outputs are combined into a single binding decision; each is independently consensus-validated by GenLayer validators (agent-level AND validator-level coordination).
- **Best Use of 1Shot Permissionless Relayer** — the entire payout path is gasless via 1Shot, directly using the registered ERC-7715/ERC-7710 permission.
- **MetaMask Smart Accounts Kit qualification** — the Treasury Smart Account + ERC-7715 `erc20-token-periodic` permission grant is in the main flow (setup) and is redeemed in the main flow (execution).

---

## 11. Open Items to Verify Before Coding

1. Confirm Base Sepolia chain ID and USDC test token address appear in `relayer_getCapabilities` response.
2. Confirm current Smart Accounts Kit package name/version and exact `erc20-token-periodic` permission/scope API (renamed from "Delegation Toolkit" — APIs shift between versions).
3. Confirm `genlayer-js` client method names for `writeContract`/`readContract` against the GenLayer testnet you target.
4. Decide GenLayer testnet faucet source for contract deployment gas.
5. Confirm `gl.vm.run_nondet_unsafe` can be called three times sequentially within one `evaluate_proposal` transaction without hitting compute limits — if it does, consider splitting into three separate write calls (`evaluate_treasurer`, `evaluate_auditor`, `evaluate_strategist`) each storing one verdict, with a final `finalize_proposal` doing the deterministic combine.

---

## 12. Stretch Goals (Put a Teaser in the Docs for Different phases)

- **Auto-proposing agent**: a second lightweight GenLayer contract that periodically checks an external feed (e.g., a public grants list via `gl.nondet.web.get`) and auto-drafts proposals — strengthens the A2A narrative (proposer agent → council agent).
- **Per-category caps**: extend `weekly_cap_micro` into a `TreeMap[str, u256]` keyed by category for finer treasury control.
- **Confidence-weighted display**: surface each persona's confidence as a visual "debate" — useful for the demo video.
