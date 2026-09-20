# Adaptive USD (aUSD) — Autonomous Decentralized Stablecoin Protocol on GenLayer

An intelligent, decentralized algorithmic stablecoin protocol deployed on **GenLayer StudioNet**. Unlike legacy CDP protocols that rely on static collateral ratios, slow manual governance multi-sigs, or trusted off-chain liquidator bots, **aUSD** operates as a fully autonomous central bank on GenLayer. It dynamically adjusts protocol risk parameters (Collateral Ratio and Stability Fee) through decentralized validator AI consensus, enforces continuous interest accrual, provides automated liquidations with a 10% collateral bonus, and defends a hard $1.00 USD peg through decentralized collateral arbitrage redemption.

---

## 1. Core Protocol Pillars

### Pillar 1: Transferable aUSD Asset (ERC-20 Token Mechanics)
aUSD is not merely an internal accounting ledger; it is a fully transferable, standard ERC-20-compliant digital token asset natively managed by the contract:
- **Circulating Supply & Balances:** Tracks global circulating supply (`total_supply`, `total_minted`) and individual account holdings via `balances: TreeMap[str, u256]`.
- **Decentralized Approvals:** Implements multi-party allowances via `allowances: TreeMap[str, TreeMap[str, u256]]`.
- **Full Standard Interface:** Complete with `transfer`, `approve`, `transfer_from`, `balance_of`, `allowance`, `name`, `symbol`, and `decimals` (18 decimals).
- **Mint & Burn Lifecycle:** Minted strictly upon locking verified native `GEN` collateral and burned upon debt repayment, liquidations, or peg redemptions.

### Pillar 2: Continuous Stability Fee Accrual
To reflect macroeconomic time value and system risk, borrow interest compounds continuously across real-time blocks:
- **Global Interest Accumulator:** Maintained via `cumulative_interest_factor` (base $1.0 \times 10^{18}$) and `last_fee_update` timestamp.
- **Accrual Formula:** For elapsed duration $\Delta t = t - t_{\text{last}}$, annual interest is compounded deterministically:
  $$\Delta \text{Factor} = \frac{\text{cumulative\_interest\_factor} \times \text{stability\_fee\_bps} \times \Delta t}{10000 \times 31536000}$$
  $$\text{cumulative\_interest\_factor}_{t} = \text{cumulative\_interest\_factor}_{t_{\text{last}}} + \Delta \text{Factor}$$
- **Debt Growth:** Any interaction (`deposit_and_mint`, `repay_and_withdraw`, `liquidate`, `accrue_interest`) updates individual vault debt according to the global accumulator factor.

### Pillar 3: 10% Bonus Liquidation Engine & 20% Safety Buffer
To prevent instant liquidations upon opening a vault, the protocol enforces strict separation between the **Mint Collateral Ratio** ($\text{CR}_{\text{mint}} = 150\%$) and the **Liquidation Threshold** ($\text{CR}_{\text{liq}} = 130\%$):
- **20% Liquidation Buffer:** Borrowers mint debt requiring $\text{CR} \ge 150\%$. A position is only subject to liquidation when market volatility or debt accumulation pushes its collateralization strictly below $130\%$:
  $$\text{Minting Requirement:} \quad (\text{collateral} \times \text{gen\_price\_usd} \times 100) \ge (\text{debt} \times \text{CR}_{\text{mint}})$$
  $$\text{Liquidation Trigger:} \quad (\text{collateral} \times \text{gen\_price\_usd} \times 100) < (\text{debt} \times \text{CR}_{\text{liq}})$$
  Positions between $130\%$ and $150\%$ cannot mint new debt but are strictly protected by the 20% buffer against liquidation.
- **Unsafe Vault Liquidation:** Any third-party liquidator holding aUSD can call `liquidate(borrower, debt_to_cover)`.
- **10% Incentive Bonus:** The liquidator repays `debt_to_cover` in aUSD and receives the equivalent USD value of borrower GEN collateral plus an immediate **10% bonus**:
  $$\text{seized\_gen} = \frac{\text{debt\_to\_cover} \times 1.10}{\text{gen\_price\_usd}}$$
- The seized GEN collateral is transferred directly to the liquidator via `_Recipient(liquidator).emit_transfer()`, protecting system solvency.

### Pillar 4: Hard Peg Defense & Global Protocol Solvency Guard
To eliminate secondary market de-pegging, the protocol enforces an on-chain arbitrage redemption floor with mathematical solvency protection:
- Any user or arbitrageur can call `redeem(ausd_amount)` to burn aUSD and directly redeem **$1.00 USD worth of GEN collateral** from protocol reserves (minus a 0.5% protocol redemption fee):
  $$\text{redeemed\_gen} = \frac{\text{ausd\_amount} \times 0.995}{\text{gen\_price\_usd}}$$
- **Global Solvency Guard:** Redemptions are strictly gated by global protocol solvency:
  $$\text{remaining\_collateral\_usd} \ge \text{remaining\_debt} \times 110\%$$
  $$\text{total\_collateral\_reserves} \ge \text{redeemed\_gen}$$
  This invariant ensures redemptions can never drain reserves below healthy levels or compromise remaining circulating aUSD holders.
- **Arbitrage Mechanism:** If aUSD trades on secondary markets at e.g. $0.95, arbitrageurs buy cheap aUSD and instantly redeem it here for $0.995 worth of GEN collateral, earning a risk-free 4.5% arbitrage spread while reducing aUSD supply until market price returns to parity.

### Pillar 5: Payable Rollback Native Asset Refund Guard
In GenLayer's execution model, native `GEN` attached to a transaction via `@gl.public.write.payable` enters the contract balance before method execution. To prevent native GEN from ever being trapped in the contract balance on revert:
- If a deposit fails validation (insufficient collateral, undercollateralized mint, or non-positive amounts), `deposit_and_mint` explicitly transfers the attached `gl.message.value` back to the sender before raising the exception:
  ```python
  _Recipient(gl.message.sender_address).emit_transfer(value=u256(deposited))
  ```
- This guarantees net-zero contract balance change on any failed or reverted transaction.

---

## 2. Failure-Closed Live Telemetry & Equivalence Principle ($\pm 2\%$ Tolerance)

Unlike naive protocols that rely on static hardcoded values, insecure off-chain oracles, or silent mock fallbacks, **aUSD enforces a strict failure-closed telemetry architecture**:

1. **Zero Mock Fallbacks (Failure-Closed Architecture):**
   - The contract queries real-time GEN market telemetry directly from the live public production endpoint: `https://genlayer-stablecoin.vercel.app/api/telemetry`.
   - All mock fallback constants (`15,000,000`, `25,000,000`, etc.) have been completely eliminated.
   - If the endpoint returns a non-200 status code, empty payload, invalid JSON, or missing required keys (`price_usd`, `volume_24h_usd`, `liquidity_depth_usd`, `volatility_index`), the transaction immediately reverts failure-closed:
     ```python
     raise Exception("TelemetryFailureClosed: Live GEN market telemetry is unavailable. Rebalance aborted.")
     ```
   - No fallback values are ever substituted; the protocol guarantees zero unverified state mutations.

2. **On-Chain Telemetry Verification State:**
   - Every successful rebalance stamps verified telemetry metadata directly into on-chain contract storage:
     - `is_telemetry_verified: bool` — Set strictly to `True` upon full validation of live telemetry and validator consensus.
     - `telemetry_source: str` — Records the exact URL (`https://genlayer-stablecoin.vercel.app/api/telemetry`).
     - `telemetry_timestamp: u256` — Records the UNIX timestamp of the verified telemetry data.
   - These fields are publicly exposed via `get_state()` for frontend health monitoring and explorer verification.

3. **Independent Telemetry Fetching & LLM Risk Deliberation:**
   - The leader validator independently fetches live GEN market data via `gl.nondet.web.get()` and passes live metrics (price, volume, liquidity depth, volatility) to the autonomous risk engine prompt.
   - The LLM reasons over actual market conditions and cites the real-time telemetry figures in `last_reasoning`.

4. **Validator Equivalence Check:**
   - Each validator independently fetches GEN market data and re-evaluates fair market value. The validator function strictly enforces:
     $$\frac{|\text{Leader\_Price} - \text{Validator\_Price}|}{\text{Validator\_Price}} \le 2.0\%$$
     $$\text{In Integer Math:} \quad |\text{Leader\_Price} - \text{Validator\_Price}| \times 100 \le \text{Validator\_Price} \times 2$$
   - If a leader proposes an unverified or manipulated price deviating by $> 2\%$, validators reject the block, triggering leader rotation.

5. **Deterministic Circuit Breakers:**
   - Prior to state mutation, parameters are strictly clamped within safe bounds:
     $$\text{CR} \in [120\%, 200\%], \quad \text{Stability Fee} \in [150 \text{ bps } (1.50\%), 1200 \text{ bps } (12.00\%)]$$

---

## 3. StudioNet Deployment & Verifiable Live On-Chain Operations

### Deployed Contract Metadata
- **Contract Address:** [`0xCC0ba4042B461935b886Dd48d195Cdf4f9Ac988A`](https://genlayer-explorer.vercel.app/address/0xCC0ba4042B461935b886Dd48d195Cdf4f9Ac988A)
- **Deployment Transaction Hash:** [`0xf508e43b723fecb67b560e348a7ee8b87530dc03ace5729cc65cf7fe1a6b7bc5`](https://genlayer-explorer.vercel.app/tx/0xf508e43b723fecb67b560e348a7ee8b87530dc03ace5729cc65cf7fe1a6b7bc5)
- **Deployment Consensus:** `MAJORITY_AGREE` (5 / 5 Validators Agreed)
- **Status:** `ACCEPTED` / `FINALIZED`
- **Network:** GenLayer StudioNet (Chain ID `61999`)
- **Native Asset:** `GEN` (18 Decimals)
- **Stablecoin Token:** `aUSD` (18 Decimals)
- **RPC Endpoint:** `https://studio.genlayer.com/api`
- **Block Explorer:** [https://genlayer-explorer.vercel.app](https://genlayer-explorer.vercel.app)
- **Live Telemetry Endpoint:** [https://genlayer-stablecoin.vercel.app/api/telemetry](https://genlayer-stablecoin.vercel.app/api/telemetry)
- **Live Production Frontend:** [https://genlayer-stablecoin.vercel.app](https://genlayer-stablecoin.vercel.app)

### Verifiable Live Rebalance & Macro Consensus
The contract features a verifiable on-chain transaction trail with 100% validator consensus:

- **Live Autonomous AI Rebalance (Failure-Closed Verified):** [`0x8c808ea3fc95849435a1b18e264de0598d807eb96aaa8115ff88cfe38b779d33`](https://genlayer-explorer.vercel.app/tx/0x8c808ea3fc95849435a1b18e264de0598d807eb96aaa8115ff88cfe38b779d33)
  - **Status / Consensus:** `ACCEPTED` / `FINALIZED`, `MAJORITY_AGREE` (5 / 5 Validators Agreed)
  - **Verified Telemetry Source:** `https://genlayer-stablecoin.vercel.app/api/telemetry`
  - **Telemetry Timestamp:** `1789913623`
  - **On-Chain Flag:** `is_telemetry_verified = True`
  - **Validator Consensus Reasoning:**
    > *"GEN demonstrates positive momentum with a 1.25% 24h increase and a current price of $1.05. While liquidity is robust with $18,450,200 in 24h volume and $28,940,000 in market depth, the protocol currently holds 0 GEN in collateral against 0 aUSD debt. A conservative 160% CR and 450 bps fee are established to manage initial volatility (0.14 index) as aUSD minting commences, ensuring solvency despite the lack of historical collateral backing."*

### Historical Protocol Verifications (Prior Finalized Lifecycle Trail)
- **Deposit & Mint:** [`0x08bfa6ae00d364e472813ec644c5b1fbc536e94fa6b558e474a625f314b82eff`](https://genlayer-explorer.vercel.app/tx/0x08bfa6ae00d364e472813ec644c5b1fbc536e94fa6b558e474a625f314b82eff) — `FINALIZED`, `MAJORITY_AGREE` (5/5)
- **Liquidation Engine:** [`0x1cdad8a4eb2c23089a3f2ec445de198c841705590d85cca4584b1ad1799f271f`](https://genlayer-explorer.vercel.app/tx/0x1cdad8a4eb2c23089a3f2ec445de198c841705590d85cca4584b1ad1799f271f) — `FINALIZED`, `MAJORITY_AGREE` (4/5)
- **Peg Redemption Arbitrage:** [`0xf3a2b6f8cb9fa60af4def642d2f1c95a4b627a6cb184504ebae5e50170488bce`](https://genlayer-explorer.vercel.app/tx/0xf3a2b6f8cb9fa60af4def642d2f1c95a4b627a6cb184504ebae5e50170488bce) — `FINALIZED`, `MAJORITY_AGREE` (5/5)
- **Transferable aUSD Token Transfer:** [`0xab5ffb4a5af4a321c4c434fe7741466ffa373675db302e0fa4e84b6cb04365b2`](https://genlayer-explorer.vercel.app/tx/0xab5ffb4a5af4a321c4c434fe7741466ffa373675db302e0fa4e84b6cb04365b2) — `FINALIZED`, `MAJORITY_AGREE` (5/5)

---

## 4. Contract Architecture Diagram

```
+-----------------------------------------------------------------------------------------------+
|                                    LIVE WEB TELEMETRY (GEN/USD)                               |
|                     (Live Market Price, 24h Delta %, Real-time Trading Volume)                |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                | gl.nondet.web.get()
                                                v
+-----------------------------------------------------------------------------------------------+
|                                 LEADER PROPOSAL EVALUATION                                    |
|                   gl.nondet.exec_prompt(MacroRiskAnalysis, response_format="json")            |
|       -> Proposes: { gen_price_usd, new_cr, new_fee_bps, rationale }                          |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                | gl.vm.run_nondet_unsafe()
                                                v
+-----------------------------------------------------------------------------------------------+
|                              INDEPENDENT VALIDATOR CONSENSUS ROUND                            |
|   1. Validators independently re-fetch GEN/USD price telemetry.                               |
|   2. Strict Price Tolerance Check: |Leader Price - Validator Price| / Validator Price <= 2.0%  |
|   3. Policy Equivalence Tolerances: |Leader CR - Validator CR| <= 15%, |Fee Delta| <= 150 bps  |
|   4. Programmatic Circuit Breakers: 120% <= CR <= 200%, 150 bps <= Fee <= 1200 bps            |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                | Consensus Finalized (ACCEPTED)
                                                v
+-----------------------------------------------------------------------------------------------+
|                                    ON-CHAIN STORAGE STATE                                     |
|   - balances: TreeMap[str, u256]                 - allowances: TreeMap[str, TreeMap[str, u256]]
|   - cumulative_interest_factor: u256 (1e18)      - last_fee_update: u256 (timestamp)          |
|   - asset_price_usd: u256 (Validator Verified)   - collateral_ratio / stability_fee_bps       |
|   - is_telemetry_verified: bool                  - telemetry_source / telemetry_timestamp    |
+-----------------------------------------------------------------------------------------------+
            |                               |                               |
            v                               v                               v
+-----------------------+       +-----------------------+       +-----------------------+
|  TRANSFERABLE aUSD    |       |   LIQUIDATION ENGINE  |       |   PEG REDEMPTION      |
|  - transfer / approve |       |   - 10% Collateral    |       |   - Hard $1.00 USD    |
|  - transfer_from      |       |     Bonus to Caller   |       |     Arbitrage Floor   |
|  - balance_of         |       |   - Solvency Defense  |       |   - 0.5% Protocol Fee |
+-----------------------+       +-----------------------+       +-----------------------+
```

---

## 5. Formal Contract Interface

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

class MonetaryPolicyContract(gl.Contract):
    # Public Views
    def name(self) -> str: ...
    def symbol(self) -> str: ...
    def decimals(self) -> u256: ...
    def total_supply(self) -> u256: ...
    def balance_of(self, account: str) -> u256: ...
    def allowance(self, owner: str, spender: str) -> u256: ...
    def get_state(self) -> dict: ...
    def get_user_position(self, user_address: str) -> dict: ...

    # Public Writes
    def transfer(self, to: str, amount: u256) -> bool: ...
    def approve(self, spender: str, amount: u256) -> bool: ...
    def transfer_from(self, sender: str, recipient: str, amount: u256) -> bool: ...
    def deposit_and_mint(self, amount_to_mint: u256) -> None: ...  # Payable with native GEN
    def repay_and_withdraw(self, burn_amount: u256, withdraw_amount: u256) -> None: ...
    def accrue_interest(self) -> None: ...
    def liquidate(self, borrower: str, debt_to_cover: u256) -> str: ...
    def redeem(self, ausd_amount: u256) -> str: ...
    def rebalance_policy(self) -> None: ...
```

---

## 6. Verification & Test Suite

The contract includes comprehensive direct-mode unit tests (`tests/direct/test_monetary_policy.py`) executing against GenLayer's VMContext test runner.

### Test Results (15/15 Passed - 100% Pass Rate)
```bash
$ pytest tests/direct/test_monetary_policy.py -v

tests/direct/test_monetary_policy.py::test_genesis_state PASSED                         [  6%]
tests/direct/test_monetary_policy.py::test_token_minting_balance_and_transfers PASSED   [ 13%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_solvency_and_tracking PASSED [ 20%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_insolvent_reverts PASSED    [ 26%]
tests/direct/test_monetary_policy.py::test_invariant_test_a_payable_rollback_refunds_on_revert PASSED [ 33%]
tests/direct/test_monetary_policy.py::test_invariant_test_b_liquidation_buffer_holds PASSED [ 40%]
tests/direct/test_monetary_policy.py::test_invariant_test_c_liquidation_under_threshold_with_bonus PASSED [ 46%]
tests/direct/test_monetary_policy.py::test_invariant_test_d_solvency_guard_prevents_drain PASSED [ 53%]
tests/direct/test_monetary_policy.py::test_repay_and_withdraw PASSED                    [ 60%]
tests/direct/test_monetary_policy.py::test_stability_fee_interest_accrual PASSED       [ 66%]
tests/direct/test_monetary_policy.py::test_peg_redemption_arbitrage PASSED             [ 73%]
tests/direct/test_monetary_policy.py::test_validator_equivalence_price_tolerance PASSED [ 80%]
tests/direct/test_monetary_policy.py::test_circuit_breakers_clamp_extreme_hallucinations PASSED [ 86%]
tests/direct/test_monetary_policy.py::test_rebalance_reverts_when_telemetry_fails PASSED [ 93%]
tests/direct/test_monetary_policy.py::test_rebalance_succeeds_with_verified_telemetry_flag PASSED [100%]

============================= 15 passed in 69.12s ==============================
```

### Static Analysis
```bash
$ genvm-lint check contracts/monetary_policy.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"MonetaryPolicyContract","methods":18,"view_methods":8,"write_methods":10,"ctor_params":0}}
```

---

## 7. Local Reproduction & Setup Guide

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- GenLayer CLI: `npm install -g genlayer`
- Python testing tools: `pip install genvm-linter genlayer-test pytest`

### Environment Configuration
Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xCC0ba4042B461935b886Dd48d195Cdf4f9Ac988A
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=c4f79cc821944d9680842e34466bfbd
```

### Running Tests
```bash
# Check AST safety and SDK semantic types
genvm-lint check contracts/monetary_policy.py

# Run direct mode invariant test suite
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
Open [http://localhost:3000](http://localhost:3000) to access the Dashboard, Vault Health monitor, Liquidation Engine, and Peg Redemption interface.

---

## 8. License
MIT License. Open source protocol for autonomous intelligent finance on GenLayer.
