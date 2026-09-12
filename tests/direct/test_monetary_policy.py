import json
import pytest

MOCK_COINGECKO_URL = r".*api\.coingecko\.com/api/v3/simple/price.*"

SAMPLE_TELEMETRY = json.dumps({
    "ethereum": {
        "usd": 2850.50,
        "usd_24h_change": -4.2,
        "usd_24h_vol": 18500000000.0
    }
})

NORMAL_LLM_OUTPUT = json.dumps({
    "new_cr": 165,
    "new_fee_bps": 450,
    "rationale": "Elevated 24h market drawdown (-4.2%) observed. Increasing collateral ratio to 165% and stability fee to 450 bps to de-risk vault solvency."
})

EXTREME_LLM_OUTPUT = json.dumps({
    "new_cr": 350,       # Exceeds 200 max
    "new_fee_bps": 5000, # Exceeds 1200 max
    "rationale": "Extreme black swan fear hallucination."
})

LOW_LLM_OUTPUT = json.dumps({
    "new_cr": 50,        # Below 120 min
    "new_fee_bps": 10,   # Below 150 min
    "rationale": "Excessive greed hallucination."
})


def test_genesis_state(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/monetary_policy.py")
    state = contract.get_state()
    assert state["collateral_ratio"] == 150
    assert state["stability_fee_bps"] == 300
    assert "Genesis" in state["last_reasoning"]
    assert state["total_minted"] == 0
    assert state["total_collateral"] == 0
    assert state["asset_price_usd"] == 2500


def test_deposit_and_mint_solvency(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Attempt to mint without collateral -> should revert
    direct_vm.value = 0
    with direct_vm.expect_revert("Must provide collateral"):
        contract.deposit_and_mint(100)

    # Deposit 1 ETH ($2500) and mint 1000 aUSD (well within 150% CR max $1666)
    direct_vm.value = 1 * 10**18
    contract.deposit_and_mint(1000)

    state = contract.get_state()
    assert state["total_minted"] == 1000
    assert state["total_collateral"] == 1 * 10**18

    pos = contract.get_user_position(direct_alice.hex() if hasattr(direct_alice, "hex") else str(direct_alice))
    assert pos["debt"] == 1000
    assert pos["is_solvent"] is True


def test_deposit_and_mint_insolvent_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Deposit 1 ETH ($2500). At CR 150%, max debt is 2500*100/150 = 1666.
    # Attempting to mint 2000 aUSD should revert!
    direct_vm.value = 1 * 10**18
    with direct_vm.expect_revert("Insolvent"):
        contract.deposit_and_mint(2000)


def test_repay_and_withdraw(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    # Deposit 2 ETH ($5000), mint 1000 aUSD
    direct_vm.value = 2 * 10**18
    contract.deposit_and_mint(1000)

    # Partial repay 500 debt, withdraw 0.5 ETH
    contract.repay_and_withdraw(500, 5 * 10**17)

    user_addr = direct_alice.hex() if hasattr(direct_alice, "hex") else str(direct_alice)
    pos = contract.get_user_position(user_addr)
    assert pos["debt"] == 500
    assert pos["collateral"] == 15 * 10**17
    assert pos["is_solvent"] is True

    # Attempting to withdraw too much collateral leaving debt insolvent
    # Remaining 1.5 ETH ($3750). Withdrawing 1.4 ETH leaves 0.1 ETH ($250) against 500 debt -> insolvent!
    with direct_vm.expect_revert("Insolvent"):
        contract.repay_and_withdraw(0, 14 * 10**17)


def test_ai_rebalance_policy_execution(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", NORMAL_LLM_OUTPUT)

    contract.rebalance_policy()

    state = contract.get_state()
    assert state["collateral_ratio"] == 165
    assert state["stability_fee_bps"] == 450
    assert "drawdown" in state["last_reasoning"]
    assert state["asset_price_usd"] == 2850


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


def test_consensus_equivalence_validation(direct_vm, direct_deploy, direct_alice):
    """Verify that validator function verifies and reaches consensus equivalence."""
    contract = direct_deploy("contracts/monetary_policy.py")
    direct_vm.sender = direct_alice

    direct_vm.mock_web(MOCK_COINGECKO_URL, {"status": 200, "body": SAMPLE_TELEMETRY})
    direct_vm.mock_llm(r".*monetary policy engine.*", NORMAL_LLM_OUTPUT)

    contract.rebalance_policy()

    # Test that validator approves leader result under the equivalence principle
    validator_agreed = direct_vm.run_validator()
    assert validator_agreed is True
