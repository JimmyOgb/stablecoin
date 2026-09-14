import json
import pytest

MOCK_COINGECKO_URL = r".*api\.coingecko\.com/api/v3/simple/price.*"

SAMPLE_TELEMETRY = json.dumps({
    "genlayer": {
        "usd": 2850.50,
        "usd_24h_change": -4.2,
        "usd_24h_vol": 18500000000.0
    }
})

NORMAL_LLM_OUTPUT = json.dumps({
    "gen_price_usd": 2850,
    "new_cr": 165,
    "new_fee_bps": 450,
    "rationale": "Elevated 24h market drawdown (-4.2%) observed. Increasing collateral ratio to 165% and stability fee to 450 bps to de-risk vault solvency."
})

EXTREME_LLM_OUTPUT = json.dumps({
    "gen_price_usd": 2850,
    "new_cr": 350,       # Exceeds 200 max
    "new_fee_bps": 5000, # Exceeds 1200 max
    "rationale": "Extreme black swan fear hallucination."
})

LOW_LLM_OUTPUT = json.dumps({
    "gen_price_usd": 2850,
    "new_cr": 50,        # Below 120 min
    "new_fee_bps": 10,   # Below 150 min
    "rationale": "Excessive greed hallucination."
})

def to_hex(addr) -> str:
    return addr.hex() if hasattr(addr, "hex") else str(addr)


def test_genesis_state(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/monetary_policy.py")
    state = contract.get_state()
    assert state["collateral_ratio"] == 150
    assert state["stability_fee_bps"] == 300
    assert "Genesis" in state["last_reasoning"]
    assert state["total_minted"] == 0
    assert state["total_collateral"] == 0
    assert state["asset_price_usd"] == 2500
    assert state["cumulative_interest_factor"] == 10**18
    assert contract.name() == "Adaptive USD"
    assert contract.symbol() == "aUSD"
    assert contract.decimals() == 18


def test_token_minting_balance_and_transfers(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Test 1: Real aUSD token minting, balance tracking, and ERC-20 transfers."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)
    charlie_addr = to_hex(direct_charlie)

    # Alice deposits 1 GEN ($2500) and mints 1000 aUSD
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

    # Deposit 1 GEN ($2500) and mint 1000 aUSD (150% CR max is $1666)
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

    # Deposit 1 GEN ($2500). At CR 150%, max debt is 2500*100/150 = 1666.66 aUSD.
    # Attempting to mint 2000 aUSD should revert!
    direct_vm.value = 1 * 10**18
    with direct_vm.expect_revert("Insolvent"):
        contract.deposit_and_mint(2000 * 10**18)


def test_repay_and_withdraw(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)

    # Deposit 2 GEN ($5000), mint 1000 aUSD
    direct_vm.value = 2 * 10**18
    contract.deposit_and_mint(1000 * 10**18)

    # Partial repay 500 debt, withdraw 0.5 GEN
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
    """Test 2: Stability fee interest accrual over simulated timestamps."""
    direct_vm.warp("2026-01-01T00:00:00Z")
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice
    alice_addr = to_hex(direct_alice)

    # Deposit 2 GEN ($5000), mint 1000 aUSD (base fee: 300 bps = 3.00% APR)
    direct_vm.value = 2 * 10**18
    contract.deposit_and_mint(1000 * 10**18)

    pos_before = contract.get_user_position(alice_addr)
    assert pos_before["debt"] == 1000 * 10**18

    # Fast forward exactly 1 year (31,536,000 seconds)
    direct_vm.warp("2027-01-01T00:00:00Z")
    contract.accrue_interest()

    # Debt should compound by exactly 3% (30 aUSD)
    # Expected debt: 1000 + 30 = 1030 aUSD
    pos_after = contract.get_user_position(alice_addr)
    expected_debt = 1030 * 10**18
    assert pos_after["debt"] == expected_debt
    assert contract.get_state()["total_minted"] == expected_debt


def test_liquidation_of_undercollateralized_vault_with_bonus(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Test 3: Liquidation of an undercollateralized vault and calculation of the 10% penalty bonus."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 1 GEN ($2500) and borrows 1500 aUSD (CR 166% > 150% min)
    direct_vm.sender = direct_alice
    direct_vm.value = 1 * 10**18
    contract.deposit_and_mint(1500 * 10**18)

    # Bob deposits 10 GEN and mints 5000 aUSD to act as liquidator
    direct_vm.sender = direct_bob
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(5000 * 10**18)

    # Alice is currently solvent; attempting to liquidate reverts
    with direct_vm.expect_revert("Borrower position is solvent"):
        contract.liquidate(alice_addr, 500 * 10**18)

    # Market risk event: GEN price drops to $2000 via AI rebalance policy
    PRICE_DROP_TELEMETRY = json.dumps({
        "genlayer": {
            "usd": 2000.0,
            "usd_24h_change": -20.0,
            "usd_24h_vol": 50000000.0
        }
    })
    PRICE_DROP_LLM = json.dumps({
        "gen_price_usd": 2000,
        "new_cr": 160,
        "new_fee_bps": 500,
        "rationale": "Severe market drawdown (-20%). Increased CR to 160%."
    })
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": PRICE_DROP_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", PRICE_DROP_LLM)
    contract.rebalance_policy()

    # Now Alice's position: 1 GEN * $2000 = $2000 collateral against 1500 aUSD debt
    # Vault CR is 2000/1500 = 133% < 160% required -> UNSAFE!
    alice_pos = contract.get_user_position(alice_addr)
    assert alice_pos["is_solvent"] is False

    # Bob liquidates 1000 aUSD of Alice's debt
    # 10% bonus: seized GEN = (1000 * 1.10) / 2000 = 1100 / 2000 = 0.55 GEN
    bob_bal_before = contract.balance_of(bob_addr)
    contract.liquidate(alice_addr, 1000 * 10**18)

    # Bob's aUSD balance decreased by 1000
    assert contract.balance_of(bob_addr) == bob_bal_before - 1000 * 10**18

    # Alice's remaining debt is 500 aUSD, remaining collateral is 1.0 - 0.55 = 0.45 GEN
    alice_pos_after = contract.get_user_position(alice_addr)
    assert alice_pos_after["debt"] == 500 * 10**18
    assert alice_pos_after["collateral"] == 45 * 10**16  # 0.45 GEN


def test_peg_redemption_arbitrage(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Test 4: Peg redemption arbitrage execution (burning 1 aUSD for $1 USD worth of GEN)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    alice_addr = to_hex(direct_alice)
    bob_addr = to_hex(direct_bob)

    # Alice deposits 10 GEN ($25,000) and mints 5000 aUSD
    direct_vm.sender = direct_alice
    direct_vm.value = 10 * 10**18
    contract.deposit_and_mint(5000 * 10**18)

    # Alice sends 1000 aUSD to Arbitrageur Bob
    contract.transfer(bob_addr, 1000 * 10**18)
    assert contract.balance_of(bob_addr) == 1000 * 10**18

    # Bob redeems 1000 aUSD for $1 USD worth of GEN (minus 0.5% fee)
    # Price = $2500/GEN. Net payout: $995 worth of GEN = 995 / 2500 = 0.398 GEN (3.98e17 wei)
    direct_vm.sender = direct_bob
    res_str = contract.redeem(1000 * 10**18)
    assert "Redeemed 1000000000000000000000 aUSD" in res_str

    # Bob's aUSD burned
    assert contract.balance_of(bob_addr) == 0

    # Protocol collateral decreased by 0.398 GEN
    state = contract.get_state()
    expected_remaining_col = 10 * 10**18 - int(0.398 * 10**18)
    assert state["total_collateral"] == expected_remaining_col


def test_validator_equivalence_price_tolerance(direct_vm, direct_deploy, direct_alice):
    """Test 5: Validator equivalence price tolerance verification (<= 2% accepted, > 2% rejected)."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", NORMAL_LLM_OUTPUT)
    contract.rebalance_policy()

    # Case A: Leader commits price 2860 (+0.35% deviation from 2850) -> WITHIN 2% tolerance -> ACCEPTED
    assert direct_vm.run_validator(leader_result={
        "gen_price_usd": 2860,
        "new_cr": 155,
        "new_fee_bps": 350,
        "rationale": "Within tolerance."
    }) is True

    # Case B: Leader commits price 3000 (+5.26% deviation from 2850) -> EXCEEDS 2% tolerance -> REJECTED
    assert direct_vm.run_validator(leader_result={
        "gen_price_usd": 3000,
        "new_cr": 155,
        "new_fee_bps": 350,
        "rationale": "Exceeds tolerance."
    }) is False


def test_circuit_breakers_clamp_extreme_hallucinations(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Upper bound test: LLM returns CR 350% and fee 5000 bps
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", EXTREME_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["collateral_ratio"] == 200      # Clamped to 200 max
    assert state["stability_fee_bps"] == 1200    # Clamped to 1200 max

    direct_vm.clear_mocks()

    # Lower bound test: LLM returns CR 50% and fee 10 bps
    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", LOW_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["collateral_ratio"] == 120      # Clamped to 120 min
    assert state["stability_fee_bps"] == 150     # Clamped to 150 min
