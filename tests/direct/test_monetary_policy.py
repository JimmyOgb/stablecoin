import json
import pytest

MOCK_ETH_TELEMETRY_URL = r".*api\.coingecko\.com/api/v3/simple/price.*"
MOCK_COINGECKO_URL = r".*api\.coingecko\.com/api/v3/simple/price.*"

SAMPLE_TELEMETRY = json.dumps({
    "ethereum": {
        "usd": 2500.0,
        "usd_24h_vol": 18450200.0,
        "usd_24h_change": 1.25,
        "last_updated_at": 1789910000,
    }
})

NORMAL_LLM_OUTPUT = json.dumps({
    "eth_price_usd": 2500,
    "new_cr": 165,
    "new_fee_bps": 450,
    "rationale": "Live Ethereum market metrics from CoinGecko evaluated: Spot Price: $2500.00, 24h Volume: $18450200, 24h Change: 1.25%. Proposing collateral ratio of 165% and stability fee of 450 bps."
})

EXTREME_LLM_OUTPUT = json.dumps({
    "eth_price_usd": 2500,
    "new_cr": 350,       # Exceeds 200 max
    "new_fee_bps": 5000, # Exceeds 1200 max
    "rationale": "Extreme black swan fear hallucination on ETH with volume $18450200."
})

LOW_LLM_OUTPUT = json.dumps({
    "eth_price_usd": 2500,
    "new_cr": 50,        # Below 120 min
    "new_fee_bps": 10,   # Below 150 min
    "rationale": "Excessive greed hallucination on ETH with volume $18450200."
})

def to_hex(addr) -> str:
    return addr.hex() if hasattr(addr, "hex") else str(addr)


def test_genesis_state(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/monetary_policy.py")
    state = contract.get_state()
    assert state["mint_collateral_ratio"] == 150
    assert state["liquidation_ratio"] == 130
    assert state["collateral_ratio"] == 150
    assert state["stability_fee_bps"] == 300
    assert "Genesis" in state["last_reasoning"]
    assert "ETH" in state["last_reasoning"]
    assert state["total_minted"] == 0
    assert state["total_collateral"] == 0
    assert state["eth_price_usd"] == 2500
    assert state["asset_price_usd"] == 2500
    assert state["cumulative_interest_factor"] == 10**18
    assert state["is_telemetry_verified"] is False
    assert state["telemetry_source"] == "CoinGecko ETH/USD Public API"
    assert state["telemetry_timestamp"] == 0
    assert contract.name() == "Adaptive USD"
    assert contract.symbol() == "aUSD"
    assert contract.decimals() == 18


def test_token_minting_balance_and_transfers(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Real aUSD token minting, balance tracking, and ERC-20 transfers."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)
    charlie_addr = to_hex(direct_charlie)

    # Alice deposits 1 ETH ($2500) and mints 1000 aUSD
    direct_vm.value = 1 * 10**18
    mint_amt = 1000 * 10**18
    contract.deposit_and_mint(mint_amt)

    assert contract.balance_of(alice_addr) == mint_amt
    assert contract.total_supply() == mint_amt

    # Alice transfers 300 aUSD to Bob
    transfer_amt = 300 * 10**18
    assert contract.transfer(bob_addr, transfer_amt) is True
    assert contract.balance_of(alice_addr) == 700 * 10**18
    assert contract.balance_of(bob_addr) == 300 * 10**18

    # Alice approves Bob for 200 aUSD
    approve_amt = 200 * 10**18
    assert contract.approve(bob_addr, approve_amt) is True
    assert contract.allowance(alice_addr, bob_addr) == approve_amt

    # Bob transfers 200 aUSD from Alice to Charlie
    direct_vm.sender = direct_bob
    assert contract.transfer_from(alice_addr, charlie_addr, approve_amt) is True
    assert contract.balance_of(alice_addr) == 500 * 10**18
    assert contract.balance_of(charlie_addr) == 200 * 10**18
    assert contract.allowance(alice_addr, bob_addr) == 0

    # Charlie cannot transfer more than balance
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Insufficient aUSD balance"):
        contract.transfer(bob_addr, 500 * 10**18)


def test_deposit_and_mint_solvency(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Attempt to mint without collateral -> should revert
    direct_vm.value = 0
    with direct_vm.expect_revert("Must provide collateral"):
        contract.deposit_and_mint(100 * 10**18)

    # Deposit 1 ETH ($2500) and mint 1000 aUSD (150% CR max is $1666)
    direct_vm.value = 1 * 10**18
    contract.deposit_and_mint(1000 * 10**18)

    state = contract.get_state()
    assert state["total_minted"] == 1000 * 10**18
    assert state["total_collateral"] == 1 * 10**18

    pos = contract.get_user_position(to_hex(direct_alice))
    assert pos["debt"] == 1000 * 10**18
    assert pos["collateral"] == 1 * 10**18
    assert pos["collateral_usd"] == 2500
    assert pos["is_solvent"] is True
    assert pos["ausd_balance"] == 1000 * 10**18


def test_deposit_and_mint_insolvent_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Deposit 1 ETH ($2500). At CR 150%, max debt is 2500*100/150 = 1666.66 aUSD.
    # Attempting to mint 2000 aUSD should revert!
    direct_vm.value = 1 * 10**18
    with direct_vm.expect_revert("Insolvent"):
        contract.deposit_and_mint(2000 * 10**18)


def test_deposit_and_mint_rollback_refund(direct_vm, direct_deploy, direct_alice):
    """A reverted deposit_and_mint refunds native ETH to caller (zero net balance change for contract)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)

    # Alice attaches 5 ETH but attempts to mint 20,000 aUSD (insolvent: 5 * 2500 = $12,500 < 20,000 * 1.5 = $30,000)
    direct_vm.value = 5 * 10**18
    with direct_vm.expect_revert("Insolvent"):
        contract.deposit_and_mint(20000 * 10**18)

    # Contract's internal total_collateral and Alice's position must be completely unaffected (0)
    state = contract.get_state()
    assert state["total_collateral"] == 0
    assert state["total_minted"] == 0

    pos = contract.get_user_position(alice_addr)
    assert pos["collateral"] == 0
    assert pos["debt"] == 0
    assert pos["ausd_balance"] == 0


def test_liquidation_buffer_separation(direct_vm, direct_deploy, direct_alice, direct_bob):
    """A position between liquidation_ratio (130%) and mint_collateral_ratio (150%) CANNOT be liquidated (buffer holds)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 1 ETH ($2500) and mints 1600 aUSD
    # Initial CR: 2500 / 1600 = 156.25% (>= 150% mint_collateral_ratio -> valid)
    direct_vm.sender = direct_alice
    direct_vm.value = 1 * 10**18
    contract.deposit_and_mint(1600 * 10**18)

    # Bob mints 5000 aUSD to act as liquidator
    direct_vm.sender = direct_bob
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(5000 * 10**18)

    # Rebalance policy moves ETH price to $2200
    # Alice position: 1 ETH * $2200 = $2200 collateral against 1600 debt
    # Vault CR = 2200 / 1600 = 137.5%
    # Notice: 137.5% is LESS than 150% (mint CR) but GREATER than 130% (liquidation ratio)!
    BUFFER_TELEMETRY = json.dumps({
        "ethereum": {
            "usd": 2200.0,
            "usd_24h_vol": 20000000.0,
            "usd_24h_change": -12.0,
            "last_updated_at": 1789910000,
        }
    })
    BUFFER_LLM = json.dumps({
        "eth_price_usd": 2200,
        "new_cr": 150,
        "new_fee_bps": 350,
        "rationale": "ETH spot price decreased to $2200.00. Maintaining mint CR at 150% and liquidation ratio at 130%."
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": BUFFER_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", BUFFER_LLM)
    contract.rebalance_policy()

    # Verify state: mint CR is 150%, liquidation ratio is 130%
    state = contract.get_state()
    assert state["mint_collateral_ratio"] == 150
    assert state["liquidation_ratio"] == 130

    alice_pos = contract.get_user_position(alice_addr)
    assert alice_pos["is_solvent"] is False        # Not eligible for new mints (137.5% < 150%)
    assert alice_pos["is_liquidatable"] is False    # BUT NOT liquidatable (137.5% >= 130%)

    # Bob attempts to liquidate Alice's position -> MUST REVERT because buffer holds!
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Borrower position is above liquidation threshold"):
        contract.liquidate(alice_addr, 500 * 10**18)


def test_liquidation_under_threshold_with_bonus(direct_vm, direct_deploy, direct_alice, direct_bob):
    """A position below liquidation_ratio (< 130%) can be liquidated with a 10% bonus."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 1 ETH ($2500) and borrows 1600 aUSD
    direct_vm.sender = direct_alice
    direct_vm.value = 1 * 10**18
    contract.deposit_and_mint(1600 * 10**18)

    # Bob mints 5000 aUSD
    direct_vm.sender = direct_bob
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(5000 * 10**18)

    # ETH price drops to $1900
    # Alice's CR is now 1900 / 1600 = 118.75% < 130% liquidation ratio!
    CRASH_TELEMETRY = json.dumps({
        "ethereum": {
            "usd": 1900.0,
            "usd_24h_vol": 45000000.0,
            "usd_24h_change": -24.0,
            "last_updated_at": 1789910000,
        }
    })
    CRASH_LLM = json.dumps({
        "eth_price_usd": 1900,
        "new_cr": 150,
        "new_fee_bps": 400,
        "rationale": "ETH spot drawdown below threshold to $1900.00. Mint CR 150%, Liquidation ratio 130%."
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": CRASH_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", CRASH_LLM)
    contract.rebalance_policy()

    alice_pos = contract.get_user_position(alice_addr)
    assert alice_pos["is_liquidatable"] is True

    # Bob liquidates 1000 aUSD of Alice's debt
    bob_bal_before = contract.balance_of(bob_addr)
    direct_vm.sender = direct_bob
    res_str = contract.liquidate(alice_addr, 1000 * 10**18)

    assert "Liquidated 1000000000000000000000 debt" in res_str
    assert "10% bonus" in res_str
    assert "ETH collateral" in res_str
    assert contract.balance_of(bob_addr) == bob_bal_before - 1000 * 10**18

    # Alice's remaining debt: 1600 - 1000 = 600 aUSD
    alice_pos_after = contract.get_user_position(alice_addr)
    assert alice_pos_after["debt"] == 600 * 10**18
    expected_seized = (1000 * 10**18 * 110) // (100 * 1900)
    assert alice_pos_after["collateral"] == (1 * 10**18) - expected_seized


def test_peg_redemption_solvency_guard(direct_vm, direct_deploy, direct_alice, direct_bob):
    """A redemption that threatens global protocol solvency reverts cleanly."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 10 ETH ($25,000) and mints 10,000 aUSD
    direct_vm.sender = direct_alice
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(10000 * 10**18)

    # Alice transfers 1000 aUSD to Bob
    contract.transfer(bob_addr, 1000 * 10**18)
    assert contract.balance_of(bob_addr) == 1000 * 10**18

    # Simulate price drop to $1050 (near insolvency: 10 ETH * 1050 = $10,500 against 10,000 debt)
    DROP_TELEMETRY = json.dumps({
        "ethereum": {
            "usd": 1050.0,
            "usd_24h_vol": 60000000.0,
            "usd_24h_change": -58.0,
            "last_updated_at": 1789910000,
        }
    })
    DROP_LLM = json.dumps({
        "eth_price_usd": 1050,
        "new_cr": 150,
        "new_fee_bps": 500,
        "rationale": "Severe ETH market drop to $1050.00. Global protocol solvency at risk."
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": DROP_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", DROP_LLM)
    contract.rebalance_policy()

    # Bob attempts to redeem 1000 aUSD
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Global protocol insolvency risk: Redemptions paused"):
        contract.redeem(1000 * 10**18)


def test_repay_and_withdraw(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)

    # Deposit 2 ETH ($5000), mint 1000 aUSD
    direct_vm.value = 2 * 10**18
    contract.deposit_and_mint(1000 * 10**18)

    # Partial repay 500 debt, withdraw 0.5 ETH
    contract.repay_and_withdraw(500 * 10**18, 5 * 10**17)

    pos = contract.get_user_position(alice_addr)
    assert pos["debt"] == 500 * 10**18
    assert pos["collateral"] == 15 * 10**17
    assert pos["is_solvent"] is True
    assert contract.balance_of(alice_addr) == 500 * 10**18

    # Transfer away remaining 500 aUSD to Bob
    contract.transfer(to_hex(direct_bob), 500 * 10**18)
    assert contract.balance_of(alice_addr) == 0

    # Attempting to repay 500 debt without aUSD balance should revert
    with direct_vm.expect_revert("Insufficient aUSD balance to repay debt"):
        contract.repay_and_withdraw(500 * 10**18, 0)


def test_stability_fee_interest_accrual(direct_vm, direct_deploy, direct_alice):
    """Stability fee interest accrual over simulated timestamps."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)

    # Deposit 2 ETH ($5000), mint 1000 aUSD (base fee: 300 bps = 3.00% APR)
    direct_vm.value = 2 * 10**18
    contract.deposit_and_mint(1000 * 10**18)

    pos_before = contract.get_user_position(alice_addr)
    assert pos_before["debt"] == 1000 * 10**18

    # Fast forward exactly 1 year (31,536,000 seconds)
    direct_vm.warp("2027-01-01T00:00:00Z")
    contract.accrue_interest()

    # Debt should compound by exactly 3% (30 aUSD)
    pos_after = contract.get_user_position(alice_addr)
    expected_debt = 1030 * 10**18
    assert pos_after["debt"] == expected_debt
    assert contract.get_state()["total_minted"] == expected_debt


def test_peg_redemption_arbitrage(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Peg redemption arbitrage execution (burning 1 aUSD for $1 USD worth of ETH)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 10 ETH ($25,000) and mints 5000 aUSD
    direct_vm.sender = direct_alice
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(5000 * 10**18)

    # Alice sends 1000 aUSD to Arbitrageur Bob
    contract.transfer(bob_addr, 1000 * 10**18)
    assert contract.balance_of(bob_addr) == 1000 * 10**18

    # Bob redeems 1000 aUSD for $1 USD worth of ETH (minus 0.5% fee)
    # Price = $2500/ETH. Net payout: $995 worth of ETH = 995 / 2500 = 0.398 ETH (3.98e17 wei)
    direct_vm.sender = direct_bob
    res_str = contract.redeem(1000 * 10**18)
    assert "Redeemed 1000000000000000000000 aUSD" in res_str
    assert "ETH collateral" in res_str

    # Bob's aUSD burned
    assert contract.balance_of(bob_addr) == 0

    # Protocol collateral decreased by 0.398 ETH
    state = contract.get_state()
    expected_remaining_col = 10 * 10**18 - int(0.398 * 10**18)
    assert state["total_collateral"] == expected_remaining_col


def test_validator_equivalence_within_2pct(direct_vm, direct_deploy, direct_alice):
    """Validator equivalence price tolerance verification (<= 2% accepted, > 2% rejected)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    sample_price_telemetry = json.dumps({
        "ethereum": {
            "usd": 1000.0,
            "usd_24h_vol": 18450200.0,
            "usd_24h_change": 1.25,
            "last_updated_at": 1789910000,
        }
    })
    llm_output_1000 = json.dumps({
        "eth_price_usd": 1000,
        "new_cr": 160,
        "new_fee_bps": 400,
        "rationale": "Live Ethereum market telemetry verified: spot price $1000.00, volume $18450200."
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": sample_price_telemetry})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", llm_output_1000)
    contract.rebalance_policy()

    # Case A: Leader commits price 1003 (+0.3% deviation from 1000) -> WITHIN 2% tolerance -> ACCEPTED
    assert direct_vm.run_validator(leader_result={
        "eth_price_usd": 1003,
        "new_cr": 160,
        "new_fee_bps": 400,
        "rationale": "Within tolerance."
    }) is True

    # Case B: Leader commits price 1060 (+6.0% deviation from 1000) -> EXCEEDS 2% tolerance -> REJECTED
    assert direct_vm.run_validator(leader_result={
        "eth_price_usd": 1060,
        "new_cr": 160,
        "new_fee_bps": 400,
        "rationale": "Exceeds tolerance."
    }) is False


def test_circuit_breakers_clamp_extreme_hallucinations(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Upper bound test: LLM returns CR 350% and fee 5000 bps
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", EXTREME_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["mint_collateral_ratio"] == 200      # Clamped to 200 max
    assert state["liquidation_ratio"] == 180          # 200 - 20 = 180
    assert state["stability_fee_bps"] == 1200         # Clamped to 1200 max

    direct_vm.clear_mocks()

    # Lower bound test: LLM returns CR 50% and fee 10 bps
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", LOW_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["mint_collateral_ratio"] == 120      # Clamped to 120 min
    assert state["liquidation_ratio"] == 100          # 120 - 20 = 100
    assert state["stability_fee_bps"] == 150          # Clamped to 150 min


def test_rebalance_reverts_on_telemetry_failure(direct_vm, direct_deploy, direct_alice):
    """Simulates failed/empty telemetry fetch and verifies rebalance_policy raises TelemetryFailureClosed."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Case 1: Web request returns 500 error
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 500, "body": "Internal Server Error"})
    with direct_vm.expect_revert("TelemetryFailureClosed"):
        contract.rebalance_policy()

    direct_vm.clear_mocks()

    # Case 2: Web request returns empty body
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": ""})
    with direct_vm.expect_revert("TelemetryFailureClosed"):
        contract.rebalance_policy()

    direct_vm.clear_mocks()

    # Case 3: Web request missing required keys (e.g. missing usd_24h_change)
    incomplete_telemetry = json.dumps({
        "ethereum": {
            "usd": 2500.0,
            "usd_24h_vol": 18450200.0,
        },
        "timestamp": 1789910000,
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": incomplete_telemetry})
    with direct_vm.expect_revert("TelemetryFailureClosed"):
        contract.rebalance_policy()

    direct_vm.clear_mocks()

    # Case 4: Web request missing "ethereum" key entirely
    missing_data_telemetry = json.dumps({
        "error": "Asset not found",
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": missing_data_telemetry})
    with direct_vm.expect_revert("TelemetryFailureClosed"):
        contract.rebalance_policy()

    # Verify no fabricated numbers committed to state
    state = contract.get_state()
    assert state["is_telemetry_verified"] is False
    assert state["telemetry_source"] == "CoinGecko ETH/USD Public API"
    assert state["telemetry_timestamp"] == 0
    assert "Genesis" in state["last_reasoning"]


def test_rebalance_succeeds_with_verified_telemetry_flag(direct_vm, direct_deploy, direct_alice):
    """Simulates valid telemetry payload and verifies is_telemetry_verified == True and on-chain state."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*autonomous monetary policy engine.*", NORMAL_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["is_telemetry_verified"] is True
    assert state["telemetry_source"] == "CoinGecko ETH/USD Public API"
    assert state["telemetry_timestamp"] == 1789910000
    assert state["mint_collateral_ratio"] == 165
    assert state["stability_fee_bps"] == 450
    assert "18450200" in state["last_reasoning"]


# Explicit aliases matching audit invariant checklist
test_rebalance_reverts_when_telemetry_fails = test_rebalance_reverts_on_telemetry_failure
test_validator_equivalence_price_tolerance = test_validator_equivalence_within_2pct
test_invariant_test_a_payable_rollback_refunds_on_revert = test_deposit_and_mint_rollback_refund
test_invariant_test_b_liquidation_buffer_holds = test_liquidation_buffer_separation
test_invariant_test_c_liquidation_under_threshold_with_bonus = test_liquidation_under_threshold_with_bonus
test_invariant_test_d_global_solvency_guard_on_redemption = test_peg_redemption_solvency_guard
