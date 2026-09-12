# Adaptive USD (aUSD) — Autonomous Monetary Policy via GenLayer AI Consensus

An intelligent algorithmic stablecoin protocol deployed on **GenLayer StudioNet**. Unlike legacy stablecoin protocols that rely on static collateral ratios or slow manual governance multi-sigs, aUSD continuously analyzes real-time cryptocurrency volatility, market drawdowns, and trading volume through decentralized validator AI consensus, automatically adjusting risk parameters (Collateral Ratio and Stability Fee) with deterministic safety bounds.

---

## 1. Problem Statement

Decentralized collateralized debt positions (CDPs) such as MakerDAO and Liquity face a fundamental dilemma:
1. **Static Risk Inefficiencies:** Fixed minimum collateral ratios (e.g., 150%) fail to protect the system during severe tail-risk cascade events and over-penalize borrowers during prolonged sideways or bull regimes.
2. **Governance Latency:** Manual parameter updates via DAO forums and multi-sig voting require days or weeks to execute, rendering protocols vulnerable to sudden liquidity freezes or oracle exploits.
3. **Oracle Rigidness:** Traditional price oracles deliver spot price feeds without macroeconomic context, volatility regime awareness, or downward velocity forecasting.

### The GenLayer Solution
By leveraging GenLayer's **GenVM** runtime and non-deterministic consensus, aUSD empowers the smart contract to natively fetch live web telemetry, process multi-modal volatility data across independent validator LLM instances, enforce comparative equivalence principles, and commit state updates without relying on trusted off-chain keepers or centralized bots.

---

## 2. StudioNet Deployment Metadata

- **Contract Address:** `0x5EE011Ca91fE569C54ee33c3555918BF0d90b784`
- **Deployment Tx Hash:** `0x0b83217b914d44e757a765ef9f2a539f7ef008423718d61718b8d6bf15f21ed6`
- **Network:** GenLayer StudioNet
- **Chain ID:** `61999`
- **Native Currency:** `GEN` (18 Decimals)
- **RPC Endpoint:** `https://studio.genlayer.com/api`
- **Block Explorer:** [https://genlayer-explorer.vercel.app](https://genlayer-explorer.vercel.app)
- **Live Production Frontend:** [https://genlayer-stablecoin.vercel.app](https://genlayer-stablecoin.vercel.app)

---

## 3. System Architecture Diagram

```
+---------------------------------------------------------------------------------------+
|                                    LIVE WEB TELEMETRY                                 |
|               (CoinGecko / Binance Live Volatility, 24h Delta, Volume)                |
+---------------------------------------------------------------------------------------+
                                           |
                                           | gl.nondet.web.get()
                                           v
+---------------------------------------------------------------------------------------+
|                             LEADER VALIDATOR PROMPT                                   |
|                 gl.nondet.exec_prompt(MacroRiskAnalysis, json)                        |
|   -> Proposes: { new_cr, new_fee_bps, rationale, live_price }                        |
+---------------------------------------------------------------------------------------+
                                           |
                                           | gl.vm.run_nondet_unsafe()
                                           v
+---------------------------------------------------------------------------------------+
|                        INDEPENDENT VALIDATOR CONSENSUS ROUND                          |
|   1. Each validator re-executes telemetry capture & LLM deliberation                 |
|   2. Equivalence Principle Tolerance Checks:                                         |
|      - |Leader CR - Validator CR| <= 15%                                              |
|      - |Leader Fee - Validator Fee| <= 150 bps                                        |
|   3. Strict Programmatic Circuit Breaker Clamping:                                    |
|      - Collateral Ratio: 120% <= CR <= 200%                                           |
|      - Stability Fee:    150 bps <= Fee <= 1200 bps                                   |
+---------------------------------------------------------------------------------------+
                                           |
                                           | State Transition Finalized (ACCEPTED)
                                           v
+---------------------------------------------------------------------------------------+
|                           ON-CHAIN STORAGE UPDATE                                     |
|   - self.collateral_ratio = u256(clamped_cr)                                          |
|   - self.stability_fee_bps = u256(clamped_fee)                                        |
|   - self.last_reasoning = decision["rationale"]                                       |
|   - self.asset_price_usd = u256(decision["price"])                                    |
+---------------------------------------------------------------------------------------+
                                           |
                   +-----------------------+-----------------------+
                   |                                               |
                   v                                               v
+------------------------------------+           +-------------------------------------+
|        AUTONOMOUS KEEPERS          |           |           NEXT.JS CLIENT            |
|  (/api/rebalance cron execution)   |           |    (RainbowKit, Wagmi, viem)       |
+------------------------------------+           +-------------------------------------+
```

---

## 4. Contract Specifications & Invariant Rules

The intelligent contract is implemented in `contracts/monetary_policy.py` targeting the pinned GenVM runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

### Storage Schema
```python
class MonetaryPolicyContract(gl.Contract):
    collateral_ratio: u256               # e.g., 150 representing 150% minimum CR
    stability_fee_bps: u256              # e.g., 300 representing 3.00% annual fee
    last_reasoning: str                  # AI macroeconomic rationale agreed by consensus
    total_minted: u256                   # Circulating aUSD debt
    total_collateral: u256               # Total native GEN deposited in wei
    asset_price_usd: u256                # Latest agreed collateral valuation
    user_collateral: TreeMap[str, u256]  # Address -> Native GEN balance in wei
    user_debt: TreeMap[str, u256]        # Address -> aUSD debt
```

### Deterministic Circuit Breaker Bounds
To guarantee financial safety regardless of LLM hallucinations or adversarial prompts, hard-coded programmatic bounds enforce invariants prior to state mutation:
- **Collateral Ratio (CR):**
  $$\forall t, \quad 120\% \le \text{CR}_t \le 200\%$$
- **Stability Fee:**
  $$\forall t, \quad 150\text{ bps } (1.50\%) \le \text{Fee}_t \le 1200\text{ bps } (12.00\%)$$

### Public Interface

| Method | Type | Inputs | Description |
| :--- | :--- | :--- | :--- |
| `rebalance_policy` | Write | None | Fetches external risk indicators, executes comparative LLM consensus, and updates monetary parameters. |
| `deposit_and_mint` | Write (Payable) | `amount_to_mint: u256` | Accepts native `GEN` (`gl.message.value`), verifies solvency against current `collateral_ratio`, and issues `aUSD`. |
| `repay_and_withdraw` | Write | `burn_amount: u256`, `withdraw_amount: u256` | Burns `aUSD` debt, verifies solvency on remaining collateral, and emits native `GEN` transfer to `gl.message.sender`. |
| `get_state` | View | None | Returns protocol state snapshot (`collateral_ratio`, `stability_fee_bps`, `last_reasoning`, etc.). |
| `get_user_position` | View | `user_address: str` | Computes user collateral value, debt, maximum borrow capacity, and solvency status. |

---

## 5. Testing & Simulation Verification

The contract includes a direct-mode test suite (`tests/direct/test_monetary_policy.py`) executing against GenLayer's VMContext test runner.

### Test Results (7/7 Passed)
```bash
$ pytest tests/direct/test_monetary_policy.py -v

tests/direct/test_monetary_policy.py::test_genesis_state PASSED                     [ 14%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_solvency PASSED        [ 28%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_insolvent_reverts PASSED [ 42%]
tests/direct/test_monetary_policy.py::test_repay_and_withdraw PASSED                [ 57%]
tests/direct/test_monetary_policy.py::test_ai_rebalance_policy_execution PASSED    [ 71%]
tests/direct/test_monetary_policy.py::test_circuit_breakers_clamp_extreme_hallucinations PASSED [ 85%]
tests/direct/test_monetary_policy.py::test_consensus_equivalence_validation PASSED [100%]

============================== 7 passed in 2.47s ==============================
```

### Static Analysis
```bash
$ genvm-lint check contracts/monetary_policy.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"MonetaryPolicyContract","methods":5,"view_methods":2,"write_methods":3,"ctor_params":0}}
```

---

## 6. Local Setup & Reproduction Guide

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- Official GenLayer CLI: `npm install -g genlayer`
- Python testing tools: `pip install genvm-linter genlayer-test pytest`

### Environment Configuration
Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5EE011Ca91fE569C54ee33c3555918BF0d90b784
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=c4f79cc821944d9680842e34466bfbd
```

### Running Tests
```bash
# Lint contract AST and SDK types
genvm-lint check contracts/monetary_policy.py

# Execute direct unit tests
pytest tests/direct/test_monetary_policy.py -v
```

### Deploying Contract to GenLayer StudioNet
```bash
genlayer deploy --contract contracts/monetary_policy.py
```

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the Vault Terminal and Central Bank Telemetry Feed.

### Autonomous Keeper Webhook
The protocol provides an autonomous keeper endpoint at `/api/rebalance` with Next.js route segment configuration (`export const maxDuration = 60`) and 200s validator consensus polling:
```bash
curl -X POST http://localhost:3000/api/rebalance
```

---

## 7. License
MIT License. Open source protocol for autonomous intelligent finance on GenLayer.
