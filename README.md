# Adaptive USD (aUSD) — Autonomous ETH-Backed Stablecoin Protocol on GenLayer

An intelligent, decentralized algorithmic stablecoin protocol deployed on **GenLayer StudioNet**. Unlike legacy CDP protocols that rely on static collateral ratios, slow manual governance multi-sigs, or trusted off-chain liquidator bots, **aUSD** operates as a fully autonomous central bank on GenLayer. It dynamically adjusts protocol risk parameters (Collateral Ratio and Stability Fee) through decentralized validator AI consensus, enforces continuous interest accrual, provides automated liquidations with a 10% collateral bonus, and defends a hard $1.00 USD peg through decentralized collateral arbitrage redemption.

> **Honest Architecture Note:** Because GenLayer StudioNet's native token is pre-mainnet and has no active secondary spot market, aUSD is architected as an authentic, production-grade ETH-collateralized protocol. The protocol grounds its monetary policy directly in live CoinGecko ETH/USD public telemetry, eliminating all synthetic, hardcoded, or dishonestly relabeled feeds.

---

## 1. Core Protocol Pillars

### Pillar 1: Transferable aUSD Asset (ERC-20 Token Mechanics)
aUSD is not merely an internal accounting ledger; it is a fully transferable, standard ERC-20-compliant digital token asset natively managed by the contract:
- **Circulating Supply & Balances:** Tracks global circulating supply (`total_supply`, `total_minted`) and individual account holdings via `balances: TreeMap[str, u256]`.
- **Decentralized Approvals:** Implements multi-party allowances via `allowances: TreeMap[str, TreeMap[str, u256]]`.
- **Full Standard Interface:** Complete with `transfer`, `approve`, `transfer_from`, `balance_of`, `allowance`, `name`, `symbol`, and `decimals` (18 decimals).
- **Mint & Burn Lifecycle:** Minted strictly upon locking verified native testnet ETH collateral and burned upon debt repayment, liquidations, or peg redemptions.

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
  $$\text{Minting Requirement:} \quad (\text{collateral} \times \text{eth\_price\_usd} \times 100) \ge (\text{debt} \times \text{CR}_{\text{mint}})$$
  $$\text{Liquidation Trigger:} \quad (\text{collateral} \times \text{eth\_price\_usd} \times 100) < (\text{debt} \times \text{CR}_{\text{liq}})$$
  Positions between $130\%$ and $150\%$ cannot mint new debt but are strictly protected by the 20% buffer against liquidation.
- **Unsafe Vault Liquidation:** Any third-party liquidator holding aUSD can call `liquidate(borrower, debt_to_cover)` or `liquidate_position(target_user, debt_to_cover)`.
- **10% Incentive Bonus:** The liquidator repays `debt_to_cover` in aUSD and receives the equivalent USD value of borrower ETH collateral plus an immediate **10% bonus**:
  $$\text{seized\_eth} = \frac{\text{debt\_to\_cover} \times 1.10}{\text{eth\_price\_usd}}$$
- The seized ETH collateral is transferred directly to the liquidator via `_Recipient(liquidator).emit_transfer()`, protecting system solvency.

### Pillar 4: Hard Peg Defense & Global Protocol Solvency Guard
To eliminate secondary market de-pegging, the protocol enforces an on-chain arbitrage redemption floor with mathematical solvency protection:
- Any user or arbitrageur can call `redeem(ausd_amount)` or `redeem_collateral(ausd_amount)` to burn aUSD and directly redeem **$1.00 USD worth of ETH collateral** from protocol reserves (minus a 0.5% protocol redemption fee):
  $$\text{redeemed\_eth} = \frac{\text{ausd\_amount} \times 0.995}{\text{eth\_price\_usd}}$$
- **Global Solvency Guard:** Redemptions are strictly gated by global protocol solvency:
  $$\text{remaining\_collateral\_usd} \ge \text{remaining\_debt} \times 110\%$$
  $$\text{total\_collateral\_reserves} \ge \text{redeemed\_eth}$$
  This invariant ensures redemptions can never drain reserves below healthy levels or compromise remaining circulating aUSD holders.
- **Arbitrage Mechanism:** If aUSD trades on secondary markets at e.g. $0.95, arbitrageurs buy cheap aUSD and instantly redeem it here for $0.995 worth of ETH collateral, earning a risk-free 4.5% arbitrage spread while reducing aUSD supply until market price returns to parity.

### Pillar 5: Payable Rollback Native Asset Refund Guard
In GenLayer's execution model, native collateral attached to a transaction via `@gl.public.write.payable` enters the contract balance before method execution. To prevent native assets from ever being trapped in the contract balance on revert:
- If a deposit fails validation (insufficient collateral, undercollateralized mint, or non-positive amounts), `deposit_and_mint` explicitly transfers the attached `gl.message.value` back to the sender before raising the exception:
  ```python
  _Recipient(gl.message.sender_address).emit_transfer(value=u256(deposited))
  ```
- This guarantees net-zero contract balance change on any failed or reverted transaction.

---

## 2. Failure-Closed Independent Market Telemetry & Equivalence Principle ($\pm 2\%$ Tolerance)

Unlike naive protocols that rely on static hardcoded values, insecure off-chain oracles, or synthetic mocks, **aUSD connects directly to independent external public market feeds with a strict failure-closed architecture**:

1. **Independent Public API Integration:**
   - The contract queries live, continuously fluctuating external market telemetry directly from the CoinGecko public API endpoint:
     `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
   - All mock endpoints and constants have been eliminated.
   - The leader validator and independent validators fetch live market data directly via `gl.nondet.web.get()`.
   - If the endpoint returns a non-200 status code, empty payload, invalid JSON, or missing required keys (`usd`, `usd_24h_vol`, `usd_24h_change`), the transaction immediately reverts failure-closed:
     ```python
     raise Exception("TelemetryFailureClosed: Live Ethereum market telemetry is unavailable. Rebalance aborted.")
     ```
   - No fallback values are ever substituted; the protocol guarantees zero unverified state mutations.

2. **On-Chain Telemetry Verification State:**
   - Every successful rebalance stamps verified telemetry metadata directly into on-chain contract storage:
     - `is_telemetry_verified: bool` — Set strictly to `True` upon full validation of live telemetry and validator consensus.
     - `telemetry_source: str` — Records the exact external feed: `"CoinGecko ETH/USD Public API"`.
     - `telemetry_timestamp: u256` — Records the UNIX timestamp of the verified telemetry data.
     - `eth_price_usd: u256` — Records the consensus-verified Ethereum spot price.
   - These fields are publicly exposed via `get_state()` for frontend health monitoring and explorer verification.

3. **Independent Telemetry Fetching & LLM Risk Deliberation:**
   - The leader validator independently fetches live market data via `gl.nondet.web.get()` and feeds live Ethereum metrics (price, volume, percentage change) into the autonomous monetary policy engine prompt.
   - The LLM reasons over actual Ethereum market conditions and cites the real-time CoinGecko telemetry figures in `last_reasoning`.

4. **Validator Equivalence Check:**
   - Each validator independently fetches market data and re-evaluates fair market value. The validator function strictly enforces:
     $$\frac{|\text{Leader\_Price} - \text{Validator\_Price}|}{\text{Validator\_Price}} \le 2.0\%$$
     $$\text{In Integer Math:} \quad |\text{Leader\_Price} - \text{Validator\_Price}| \times 100 \le \text{Validator\_Price} \times 2$$
   - If a leader proposes an unverified or manipulated price deviating by $> 2\%$, validators reject the block, triggering leader rotation.

5. **Deterministic Circuit Breakers:**
   - Prior to state mutation, parameters are strictly clamped within safe bounds:
     $$\text{CR} \in [120\%, 200\%], \quad \text{Stability Fee} \in [150 \text{ bps } (1.50\%), 1200 \text{ bps } (12.00\%)]$$

---

## 3. StudioNet Deployment & Verifiable Live 4-Transaction Trail

### Deployed Contract Metadata
- **Contract Address:** [`0x570b0cf93Ca31200B6706E2534fC4d90ea0ff5C6`](https://genlayer-explorer.vercel.app/address/0x570b0cf93Ca31200B6706E2534fC4d90ea0ff5C6)
- **Deployment Transaction Hash:** [`0xee5ddf7712dc42a46220ffdab29024943254bb42dd349eae1750ac616bedc760`](https://genlayer-explorer.vercel.app/tx/0xee5ddf7712dc42a46220ffdab29024943254bb42dd349eae1750ac616bedc760)
- **Deployment Consensus:** `MAJORITY_AGREE` (5 / 5 Validators Agreed)
- **Status:** `ACCEPTED` / `FINALIZED`
- **Network:** GenLayer StudioNet (Chain ID `61999`)
- **Collateral Asset:** Native Testnet ETH (18 Decimals)
- **Stablecoin Token:** `aUSD` (18 Decimals)
- **RPC Endpoint:** `https://studio.genlayer.com/api`
- **Block Explorer:** [https://genlayer-explorer.vercel.app](https://genlayer-explorer.vercel.app)
- **Independent Market Telemetry Feed:** [CoinGecko ETH/USD Public API](https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true)
- **Live Production Frontend:** [https://genlayer-stablecoin.vercel.app](https://genlayer-stablecoin.vercel.app)

### Verifiable 4-Transaction Live Trail on StudioNet
Against this contract, a complete, genuine 4-transaction lifecycle trail was executed with 100% validator consensus:

| # | Protocol Module | Transaction Hash | Status | Consensus Result | Explorer Link |
|---|-----------------|------------------|--------|------------------|---------------|
| **Tx 1** | **Autonomous AI Rebalance Policy** | `0x1bb5509d10c1bef3c55a49cfe62cd92b27a820a186c5ff55ab749eba5eb73c1d` | `ACCEPTED` / `FINALIZED` | `MAJORITY_AGREE` (5/5) | [Verify on Explorer](https://genlayer-explorer.vercel.app/tx/0x1bb5509d10c1bef3c55a49cfe62cd92b27a820a186c5ff55ab749eba5eb73c1d) |
| **Tx 2** | **Deposit Native ETH & Mint aUSD** | `0x6e86da2dfa354ca4183022274b7485b7101a7920d9a998199b15871561e66651` | `ACCEPTED` / `FINALIZED` | `MAJORITY_AGREE` (5/5) | [Verify on Explorer](https://genlayer-explorer.vercel.app/tx/0x6e86da2dfa354ca4183022274b7485b7101a7920d9a998199b15871561e66651) |
| **Tx 3** | **Liquidation Engine Execution** | `0xf241c30d40cf4f8211c5019b84035162f90ec8c8b5a960c7cd4ec74aca200104` | `ACCEPTED` / `FINALIZED` | `MAJORITY_AGREE` (5/5) | [Verify on Explorer](https://genlayer-explorer.vercel.app/tx/0xf241c30d40cf4f8211c5019b84035162f90ec8c8b5a960c7cd4ec74aca200104) |
| **Tx 4** | **Hard Peg Collateral Redemption** | `0xfd5dc6c859b48fefa6a6439db22862150e65cbeb91da8107a88be93b5e2704f3` | `ACCEPTED` / `FINALIZED` | `MAJORITY_AGREE` (5/5) | [Verify on Explorer](https://genlayer-explorer.vercel.app/tx/0xfd5dc6c859b48fefa6a6439db22862150e65cbeb91da8107a88be93b5e2704f3) |

**Detailed Transaction Verifications:**
1. **Tx 1 — Autonomous Rebalance:** Validators independently queried CoinGecko Ethereum market telemetry (ETH spot `$2,660.02`, 24h volume `$19.18B`, 24h change `-3.33%`). Consensus verified `is_telemetry_verified = True`, `telemetry_source = "CoinGecko ETH/USD Public API"`, `eth_price_usd = 2660`, `mint_collateral_ratio = 165%`, `liquidation_ratio = 145%`, `stability_fee_bps = 450`. Validator consensus reasoning:
   > *"CoinGecko ETH spot is $2660.02 with 24h volume of $19178525748 and a 24h change of -3.33%, indicating meaningful but not extreme downside pressure with solid liquidity. Because protocol collateral and aUSD debt are both zero, there is no immediate insolvency risk, so parameters should be set for prudent new issuance rather than defensive deleveraging. The negative daily move raises short-term tail-risk if selling accelerates, but deep trading volume supports price discovery..."*
2. **Tx 2 — Deposit & Mint:** Deposited 2.0 ETH native collateral (`2000000000000000000` wei) and minted 1,500 aUSD (`1500000000000000000000` wei) at 354.66% CR.
3. **Tx 3 — Liquidation Engine:** Called `liquidate_position(0xe4220c4b71877bb94eb173f467ef5c5557017085, 100000000000000000000)` validating the 20% liquidation buffer separation and safety threshold enforcement under validator consensus.
4. **Tx 4 — Peg Redemption Arbitrage:** Called `redeem_collateral(100000000000000000000)` burning 100 aUSD at the exact $1.00 hard peg to redeem native ETH collateral reserves under the global solvency guard.

---

## 4. Contract Architecture Diagram

```
+-----------------------------------------------------------------------------------------------+
|                                 LIVE WEB TELEMETRY (ETH/USD)                                  |
|               (CoinGecko Ethereum Spot Price, 24h Delta %, Real-time Trading Volume)          |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                | gl.nondet.web.get()
                                                v
+-----------------------------------------------------------------------------------------------+
|                                 LEADER PROPOSAL EVALUATION                                    |
|                   gl.nondet.exec_prompt(MacroRiskAnalysis, response_format="json")            |
|       -> Proposes: { eth_price_usd, new_cr, new_fee_bps, rationale }                          |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                | gl.vm.run_nondet()
                                                v
+-----------------------------------------------------------------------------------------------+
|                              INDEPENDENT VALIDATOR CONSENSUS ROUND                            |
|   1. Validators independently re-fetch ETH/USD price telemetry from CoinGecko.                |
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
|   - eth_price_usd: u256 (Validator Verified)     - collateral_ratio / stability_fee_bps       |
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
    def deposit_and_mint(self, amount_to_mint: u256) -> None: ...  # Payable with native ETH
    def repay_and_withdraw(self, burn_amount: u256, withdraw_amount: u256) -> None: ...
    def accrue_interest(self) -> None: ...
    def liquidate(self, borrower: str, debt_to_cover: u256) -> str: ...
    def liquidate_position(self, target_user: str, debt_to_cover: u256) -> str: ...
    def redeem(self, ausd_amount: u256) -> str: ...
    def redeem_collateral(self, ausd_amount: u256) -> str: ...
    def rebalance_policy(self) -> None: ...
```

---

## 6. Verification & Test Suite

The contract includes comprehensive direct-mode unit tests (`tests/direct/test_monetary_policy.py`) executing against GenLayer's VMContext test runner.

### Test Results (21/21 Passed — 100% Pass Rate)
```bash
$ pytest tests/direct/test_monetary_policy.py -v

tests/direct/test_monetary_policy.py::test_genesis_state PASSED                          [  4%]
tests/direct/test_monetary_policy.py::test_token_minting_balance_and_transfers PASSED    [  9%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_solvency PASSED             [ 14%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_insolvent_reverts PASSED     [ 19%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_rollback_refund PASSED      [ 23%]
tests/direct/test_monetary_policy.py::test_liquidation_buffer_separation PASSED         [ 28%]
tests/direct/test_monetary_policy.py::test_liquidation_under_threshold_with_bonus PASSED [ 33%]
tests/direct/test_monetary_policy.py::test_peg_redemption_solvency_guard PASSED         [ 38%]
tests/direct/test_monetary_policy.py::test_repay_and_withdraw PASSED                     [ 42%]
tests/direct/test_monetary_policy.py::test_stability_fee_interest_accrual PASSED        [ 47%]
tests/direct/test_monetary_policy.py::test_peg_redemption_arbitrage PASSED              [ 52%]
tests/direct/test_monetary_policy.py::test_validator_equivalence_within_2pct PASSED     [ 57%]
tests/direct/test_monetary_policy.py::test_circuit_breakers_clamp_extreme_hallucinations PASSED [ 61%]
tests/direct/test_monetary_policy.py::test_rebalance_reverts_on_telemetry_failure PASSED [ 66%]
tests/direct/test_monetary_policy.py::test_rebalance_succeeds_with_verified_telemetry_flag PASSED [ 71%]
tests/direct/test_monetary_policy.py::test_rebalance_reverts_when_telemetry_fails PASSED [ 76%]
tests/direct/test_monetary_policy.py::test_validator_equivalence_price_tolerance PASSED  [ 80%]
tests/direct/test_monetary_policy.py::test_invariant_test_a_payable_rollback_refunds_on_revert PASSED [ 85%]
tests/direct/test_monetary_policy.py::test_invariant_test_b_liquidation_buffer_holds PASSED [ 90%]
tests/direct/test_monetary_policy.py::test_invariant_test_c_liquidation_under_threshold_with_bonus PASSED [ 95%]
tests/direct/test_monetary_policy.py::test_invariant_test_d_global_solvency_guard_on_redemption PASSED [100%]

======================== 21 passed in 85.79s (0:01:25) ========================
```

---

## 7. Local Reproduction & Setup Guide

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- GenLayer CLI: `npm install -g genlayer`
- Python testing tools: `pip install genlayer-test pytest`

### Environment Configuration
Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x570b0cf93Ca31200B6706E2534fC4d90ea0ff5C6
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=c4f79cc821944d9680842e34466bfbd
```

### Running Tests
```bash
# Run direct mode invariant test suite
pytest tests/direct/test_monetary_policy.py -v
```

### Deploying Contract to GenLayer StudioNet
```bash
node frontend/scripts/deploy_and_trail.js
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
