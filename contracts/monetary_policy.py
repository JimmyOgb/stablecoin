# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

TELEMETRY_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true"
DEFAULT_ETH_PRICE = 2500

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass

def normalize_address(addr: str) -> str:
    s = str(addr).strip().lower()
    if not s.startswith("0x"):
        s = "0x" + s
    return s

class MonetaryPolicyContract(gl.Contract):
    collateral_ratio: u256
    stability_fee_bps: u256
    last_reasoning: str
    total_minted: u256
    total_collateral: u256
    asset_price_usd: u256
    user_collateral: TreeMap[str, u256]
    user_debt: TreeMap[str, u256]

    def __init__(self):
        self.collateral_ratio = u256(150)
        self.stability_fee_bps = u256(300)
        self.last_reasoning = "Genesis monetary policy: Normal volatility conditions. Base CR set to 150%, stability fee 300 bps."
        self.total_minted = u256(0)
        self.total_collateral = u256(0)
        self.asset_price_usd = u256(DEFAULT_ETH_PRICE)
        self.user_collateral = TreeMap()
        self.user_debt = TreeMap()

    def _is_solvent(self, col_amount: int, debt_amount: int) -> bool:
        if debt_amount <= 0:
            return True
        if col_amount <= 0:
            return False
        price = int(self.asset_price_usd)
        cr = int(self.collateral_ratio)
        col_scaled = col_amount // (10**18) if col_amount >= 10**14 else col_amount
        debt_scaled = debt_amount // (10**18) if debt_amount >= 10**14 else debt_amount
        col_val_usd = col_scaled * price
        return (col_val_usd * 100) >= (debt_scaled * cr)

    @gl.public.write
    def rebalance_policy(self) -> None:
        def leader_fn() -> dict:
            price = DEFAULT_ETH_PRICE
            change_24h = 0.0
            volume_24h = 10_000_000_000.0

            try:
                web_res = gl.nondet.web.get(TELEMETRY_URL)
                raw_body = web_res.body
                if isinstance(raw_body, bytes):
                    body_text = raw_body.decode("utf-8")
                else:
                    body_text = str(raw_body)
                telemetry = json.loads(body_text)
                eth_data = telemetry.get("ethereum", {})
                if "usd" in eth_data:
                    price = int(float(eth_data["usd"]))
                if "usd_24h_change" in eth_data:
                    change_24h = float(eth_data["usd_24h_change"])
                if "usd_24h_vol" in eth_data:
                    volume_24h = float(eth_data["usd_24h_vol"])
            except Exception:
                price = int(self.asset_price_usd)

            prompt = (
                "You are the autonomous monetary policy engine for an intelligent algorithmic stablecoin on GenLayer.\\n"
                "Analyze the following real-time market risk metrics:\\n"
                f"- Asset: ETH/USD\\n"
                f"- Live Price: ${price}\\n"
                f"- 24h Price Change: {change_24h:.2f}%\\n"
                f"- 24h Trading Volume: ${volume_24h:.0f}\\n\\n"
                "Evaluate tail-risk, volatility, and downward price action to recommend protocol parameters:\\n"
                "1. new_cr: Minimum collateral ratio (e.g. 150 for 150%). Range: 120 to 200.\\n"
                "2. new_fee_bps: Stability borrow fee in basis points (e.g. 300 for 3.00%). Range: 150 to 1200.\\n"
                "3. rationale: A concise macroeconomic explanation justifying these rate changes.\\n\\n"
                "Respond with strictly valid JSON:\\n"
                '{"new_cr": <int>, "new_fee_bps": <int>, "rationale": "<string>"}'
            )

            llm_res = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(llm_res, str):
                clean_json = llm_res.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_json)
            elif isinstance(llm_res, dict):
                parsed = llm_res
            else:
                raise gl.vm.UserError("[LLM_ERROR] Invalid LLM response format")

            raw_cr = parsed.get("new_cr", parsed.get("collateral_ratio", 150))
            raw_fee = parsed.get("new_fee_bps", parsed.get("stability_fee_bps", 300))
            rationale_text = str(parsed.get("rationale", parsed.get("reasoning", "Adaptive policy updated.")))

            try:
                cr_val = int(round(float(str(raw_cr).strip())))
            except (ValueError, TypeError):
                cr_val = 150

            try:
                fee_val = int(round(float(str(raw_fee).strip())))
            except (ValueError, TypeError):
                fee_val = 300

            # Circuit breakers
            clamped_cr = max(120, min(200, cr_val))
            clamped_fee = max(150, min(1200, fee_val))

            return {
                "new_cr": clamped_cr,
                "new_fee_bps": clamped_fee,
                "rationale": rationale_text[:500],
                "price": price,
            }

        def validator_fn(leader_res: gl.vm.Result) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            leader_data = leader_res.calldata
            if not isinstance(leader_data, dict):
                return False

            validator_data = leader_fn()

            l_cr = leader_data.get("new_cr")
            v_cr = validator_data.get("new_cr")
            l_fee = leader_data.get("new_fee_bps")
            v_fee = validator_data.get("new_fee_bps")

            if l_cr is None or v_cr is None or l_fee is None or v_fee is None:
                return False

            # Circuit breaker bounds check
            if not (120 <= l_cr <= 200 and 120 <= v_cr <= 200):
                return False
            if not (150 <= l_fee <= 1200 and 150 <= v_fee <= 1200):
                return False

            # Equivalence tolerance check
            if abs(l_cr - v_cr) > 15:
                return False
            if abs(l_fee - v_fee) > 150:
                return False

            return True

        decision = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.collateral_ratio = u256(decision["new_cr"])
        self.stability_fee_bps = u256(decision["new_fee_bps"])
        self.last_reasoning = decision["rationale"]
        if decision.get("price") and decision["price"] > 0:
            self.asset_price_usd = u256(decision["price"])

    @gl.public.write.payable
    def deposit_and_mint(self, amount_to_mint: u256) -> None:
        user = normalize_address(str(gl.message.sender_address))
        deposited = int(gl.message.value)
        mint_amount = int(amount_to_mint)

        current_col = int(self.user_collateral.get(user, u256(0)))
        current_debt = int(self.user_debt.get(user, u256(0)))

        new_col = current_col + deposited
        if new_col <= 0:
            raise gl.vm.UserError("[EXPECTED] Must provide collateral to mint")

        if mint_amount < 0:
            raise gl.vm.UserError("[EXPECTED] Mint amount must be non-negative")

        new_debt = current_debt + mint_amount
        if not self._is_solvent(new_col, new_debt):
            raise gl.vm.UserError("[EXPECTED] Insolvent: collateral does not satisfy required collateral ratio")

        self.user_collateral[user] = u256(new_col)
        self.user_debt[user] = u256(new_debt)
        self.total_collateral = u256(int(self.total_collateral) + deposited)
        self.total_minted = u256(int(self.total_minted) + mint_amount)

    @gl.public.write
    def repay_and_withdraw(self, burn_amount: u256, withdraw_amount: u256) -> None:
        user = normalize_address(str(gl.message.sender_address))
        burn_val = int(burn_amount)
        withdraw_val = int(withdraw_amount)

        if burn_val < 0 or withdraw_val < 0:
            raise gl.vm.UserError("[EXPECTED] Amounts must be non-negative")

        current_debt = int(self.user_debt.get(user, u256(0)))
        current_col = int(self.user_collateral.get(user, u256(0)))

        if burn_val > current_debt:
            raise gl.vm.UserError("[EXPECTED] Burn amount exceeds user debt")
        if withdraw_val > current_col:
            raise gl.vm.UserError("[EXPECTED] Withdraw amount exceeds user collateral")

        remaining_debt = current_debt - burn_val
        remaining_col = current_col - withdraw_val

        if remaining_debt > 0 and not self._is_solvent(remaining_col, remaining_debt):
            raise gl.vm.UserError("[EXPECTED] Insolvent: remaining collateral does not satisfy required collateral ratio")

        self.user_debt[user] = u256(remaining_debt)
        self.user_collateral[user] = u256(remaining_col)
        self.total_collateral = u256(int(self.total_collateral) - withdraw_val)
        self.total_minted = u256(int(self.total_minted) - burn_val)

        if withdraw_val > 0:
            _Recipient(gl.message.sender_address).emit_transfer(value=u256(withdraw_val))

    @gl.public.view
    def get_state(self) -> dict:
        return {
            "collateral_ratio": int(self.collateral_ratio),
            "stability_fee_bps": int(self.stability_fee_bps),
            "last_reasoning": self.last_reasoning,
            "total_minted": int(self.total_minted),
            "total_collateral": int(self.total_collateral),
            "asset_price_usd": int(self.asset_price_usd),
        }

    @gl.public.view
    def get_user_position(self, user_address: str) -> dict:
        user = normalize_address(user_address)
        col = int(self.user_collateral.get(user, u256(0)))
        debt = int(self.user_debt.get(user, u256(0)))
        price = int(self.asset_price_usd)
        cr = int(self.collateral_ratio)

        col_scaled = col // (10**18) if col >= 10**14 else col
        debt_scaled = debt // (10**18) if debt >= 10**14 else debt
        col_usd = col_scaled * price

        max_debt = (col_usd * 100) // cr if cr > 0 else 0
        current_cr_bps = (col_usd * 10000) // debt_scaled if debt_scaled > 0 else 0

        return {
            "user": user,
            "collateral": col,
            "collateral_usd": col_usd,
            "debt": debt,
            "max_debt": max_debt,
            "current_cr_bps": current_cr_bps,
            "is_solvent": self._is_solvent(col, debt),
        }
