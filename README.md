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

### Pillar 3: 10% Bonus Liquidation Engine
When market volatility reduces the value of locked GEN collateral below the dynamic Collateral Ratio ($\text{CR}_t$), the vault becomes undercollateralized ($\text{is\_solvent} = \text{False}$):
$$\text{Solvency Condition:} \quad (\text{collateral} \times \text{gen\_price\_usd} \times 100) \ge (\text{debt} \times \text{CR})$$
- **Unsafe Vault Liquidation:** Any third-party liquidator holding aUSD can call `liquidate(borrower, debt_to_cover)`.
- **10% Incentive Bonus:** The liquidator repays `debt_to_cover` in aUSD and receives the equivalent USD value of borrower GEN collateral plus an immediate **10% bonus**:
  $$\text{seized\_gen} = \frac{\text{debt\_to\_cover} \times 1.10}{\text{gen\_price\_usd}}$$
- The seized GEN collateral is transferred directly to the liquidator via `_Recipient(liquidator).emit_transfer()`, protecting system solvency.

### Pillar 4: Hard Peg Defense Mechanism ($1.00 Peg Floor Redemption)
To eliminate secondary market de-pegging, the protocol enforces an on-chain arbitrage redemption floor:
- Any user or arbitrageur can call `redeem(ausd_amount)` to burn aUSD and directly redeem **$1.00 USD worth of GEN collateral** from protocol reserves (minus a 0.5% protocol redemption fee):
  $$\text{redeemed\_gen} = \frac{\text{ausd\_amount} \times 0.995}{\text{gen\_price\_usd}}$$
- **Arbitrage Mechanism:** If aUSD trades on secondary markets at e.g. $0.95, arbitrageurs buy cheap aUSD and instantly redeem it here for $0.995 worth of GEN collateral, earning an instant risk-free 4.5% arbitrage spread while reducing aUSD supply until market price returns to parity.

---

## 2. Validator-Checked GEN Price & Equivalence Principle ($\pm 2\%$ Tolerance)

Unlike naive contracts that trust a single leader's price feed, aUSD enforces GenLayer's non-deterministic equivalence principle (`gl.vm.run_nondet_unsafe`):

1. **Independent Telemetry Fetching:** The leader validator fetches live GEN/USD price telemetry and market risk indicators via `gl.nondet.web.get()` and proposes:
   $$\{\text{gen\_price\_usd}, \, \text{new\_cr}, \, \text{new\_fee\_bps}, \, \text{rationale}\}$$
2. **Validator Equivalence Check:** Each validator independently fetches GEN market data and re-evaluates fair market value. The validator function strictly enforces:
   $$\frac{|\text{Leader\_Price} - \text{Validator\_Price}|}{\text{Validator\_Price}} \le 2.0\%$$
   $$\text{In Integer Math:} \quad |\text{Leader\_Price} - \text{Validator\_Price}| \times 100 \le \text{Validator\_Price} \times 2$$
3. **Consensus Rejection on Divergence:** If a leader proposes an unverified or manipulated price deviating by $> 2\%$, validators reject the block, triggering leader rotation.
4. **Deterministic Circuit Breakers:** Prior to state mutation, parameters are strictly clamped:
   $$\text{CR} \in [120\%, 200\%], \quad \text{Stability Fee} \in [150 \text{ bps } (1.50\%), 1200 \text{ bps } (12.00\%)]$$

---

## 3. StudioNet Deployment Metadata

- **Contract Address:** `0xf7908d23780bA6fd489B5835f13143c5aF15Fe06`
- **Deployment Tx Hash:** `0xf304492b537da795eb8542ec765d74d74d2be5ea7d16c5bb2c167a381a0e17fc`
- **Consensus Round Result:** `MAJORITY_AGREE` (5 / 5 Validators Agreed)
- **Status:** `ACCEPTED`
- **Network:** GenLayer StudioNet
- **Chain ID:** `61999`
- **Native Currency:** `GEN` (18 Decimals)
- **Stablecoin Token:** `aUSD` (18 Decimals)
- **RPC Endpoint:** `https://studio.genlayer.com/api`
- **Block Explorer:** [https://genlayer-explorer.vercel.app](https://genlayer-explorer.vercel.app)
- **Live Production Frontend:** [https://genlayer-stablecoin.vercel.app](https://genlayer-stablecoin.vercel.app)

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

### Test Results (10/10 Passed)
```bash
$ pytest tests/direct/test_monetary_policy.py -v

tests/direct/test_monetary_policy.py::test_genesis_state PASSED                         [ 10%]
tests/direct/test_monetary_policy.py::test_token_minting_balance_and_transfers PASSED   [ 20%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_solvency PASSED            [ 30%]
tests/direct/test_monetary_policy.py::test_deposit_and_mint_insolvent_reverts PASSED    [ 40%]
tests/direct/test_monetary_policy.py::test_repay_and_withdraw PASSED                    [ 50%]
tests/direct/test_monetary_policy.py::test_stability_fee_interest_accrual PASSED       [ 60%]
tests/direct/test_monetary_policy.py::test_liquidation_of_undercollateralized_vault_with_bonus PASSED [ 70%]
tests/direct/test_monetary_policy.py::test_peg_redemption_arbitrage PASSED             [ 80%]
tests/direct/test_monetary_policy.py::test_validator_equivalence_price_tolerance PASSED [ 90%]
tests/direct/test_monetary_policy.py::test_circuit_breakers_clamp_extreme_hallucinations PASSED [100%]

============================= 10 passed in 2.85s ==============================
```

### Static Analysis
```bash
$ genvm-lint check contracts/monetary_policy.py --json
{"ok":true,"lint":{"ok":true,"passed":3},"validate":{"ok":true,"contract":"MonetaryPolicyContract","methods":17,"view_methods":8,"write_methods":9,"ctor_params":0}}
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
NEXT_PUBLIC_CONTRACT_ADDRESS=0xf7908d23780bA6fd489B5835f13143c5aF15Fe06
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
