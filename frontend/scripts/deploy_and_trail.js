const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient, createAccount, chains } = require("genlayer-js");
const keytar = require("C:/Users/NO GO NO/AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar");

async function main() {
  console.log("=================================================");
  console.log("=== STEP 1: Setting up Deployer & Client ===");
  console.log("=================================================");
  const privKey = await keytar.getPassword("genlayer-cli", "account:ace-deployer");
  if (!privKey) {
    throw new Error("Could not find private key for ace-deployer in OS keychain");
  }
  const deployerAccount = createAccount(privKey);
  console.log("Deployer Address:", deployerAccount.address);

  const client = createClient({
    chain: chains.studionet,
    endpoint: "https://studio.genlayer.com/api",
    account: deployerAccount,
  });

  const contractPath = path.resolve(__dirname, "../../contracts/monetary_policy.py");
  const code = fs.readFileSync(contractPath, "utf8");
  console.log("Contract loaded from:", contractPath, `(${code.length} bytes)`);

  console.log("\n=================================================");
  console.log("=== STEP 2: Deploying Contract to StudioNet ===");
  console.log("=================================================");
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
    leaderOnly: false,
  });
  console.log("Deployment Transaction Hash:", deployTxHash);

  console.log("Waiting for deployment receipt...");
  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 60,
    interval: 4000,
    fullTransaction: true,
  });

  console.log("Deploy Status:", deployReceipt.statusName);
  console.log("Deploy Consensus Result:", deployReceipt.result_name);

  const deployedContractAddress =
    deployReceipt.data?.contract_address ??
    deployReceipt.recipient ??
    deployReceipt.txDataDecoded?.contractAddress;

  console.log("Deployed Contract Address:", deployedContractAddress);
  if (!deployedContractAddress) {
    throw new Error("Failed to resolve deployed contract address from receipt");
  }

  const genesisState = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_state",
    args: [],
  });
  console.log("Genesis State Initialized:");
  console.log(" - Mint Collateral Ratio:", genesisState.mint_collateral_ratio);
  console.log(" - Liquidation Ratio:", genesisState.liquidation_ratio);
  console.log(" - Asset Price USD:", genesisState.asset_price_usd);
  console.log(" - Stability Fee BPS:", genesisState.stability_fee_bps);
  console.log(" - Telemetry Verified:", genesisState.is_telemetry_verified);

  console.log("\n=================================================");
  console.log("=== TX 1: Autonomous AI Rebalance Policy ===");
  console.log("=================================================");
  console.log("Triggering rebalance_policy() against independent CoinGecko market telemetry...");
  const rebalanceTxHash = await client.writeContract({
    address: deployedContractAddress,
    functionName: "rebalance_policy",
    args: [],
    value: BigInt(0),
  });
  console.log("Rebalance Tx Hash:", rebalanceTxHash);

  console.log("Waiting for rebalance consensus finalization (validators fetching independently)...");
  const rebalanceReceipt = await client.waitForTransactionReceipt({
    hash: rebalanceTxHash,
    retries: 60,
    interval: 4000,
    fullTransaction: true,
  });
  console.log("Rebalance Status:", rebalanceReceipt.statusName);
  console.log("Rebalance Result:", rebalanceReceipt.result_name);

  const postRebalanceState = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_state",
    args: [],
  });
  console.log("\nPost-Rebalance State:");
  console.log(" - is_telemetry_verified:", postRebalanceState.is_telemetry_verified);
  console.log(" - telemetry_source:", postRebalanceState.telemetry_source);
  console.log(" - telemetry_timestamp:", postRebalanceState.telemetry_timestamp);
  console.log(" - asset_price_usd:", postRebalanceState.asset_price_usd);
  console.log(" - mint_collateral_ratio:", postRebalanceState.mint_collateral_ratio);
  console.log(" - liquidation_ratio:", postRebalanceState.liquidation_ratio);
  console.log(" - stability_fee_bps:", postRebalanceState.stability_fee_bps);
  console.log(" - last_reasoning:", postRebalanceState.last_reasoning);

  console.log("\n=================================================");
  console.log("=== TX 2: Deposit Native GEN & Mint aUSD ===");
  console.log("=================================================");
  const mintAmountWei = BigInt("1500000000000000000000"); // 1,500 aUSD
  const depositWei = BigInt("2000000000000000000"); // 2 GEN
  console.log(`Depositing 2 GEN and minting 1,500 aUSD...`);
  const mintTxHash = await client.writeContract({
    address: deployedContractAddress,
    functionName: "deposit_and_mint",
    args: [mintAmountWei],
    value: depositWei,
  });
  console.log("Mint Tx Hash:", mintTxHash);

  console.log("Waiting for mint consensus finalization...");
  const mintReceipt = await client.waitForTransactionReceipt({
    hash: mintTxHash,
    retries: 60,
    interval: 4000,
    fullTransaction: true,
  });
  console.log("Mint Status:", mintReceipt.statusName);
  console.log("Mint Result:", mintReceipt.result_name);

  const deployerPosition = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_user_position",
    args: [deployerAccount.address],
  });
  console.log("Deployer Position after mint:", deployerPosition);

  console.log("\n=================================================");
  console.log("=== TX 3: Liquidation Engine Execution ===");
  console.log("=================================================");
  console.log("Calling liquidate_position on target vault to verify liquidation engine consensus...");
  const liquidationCoverAmount = BigInt("100000000000000000000"); // 100 aUSD
  const liquidationTxHash = await client.writeContract({
    address: deployedContractAddress,
    functionName: "liquidate_position",
    args: [deployerAccount.address, liquidationCoverAmount],
    value: BigInt(0),
  });
  console.log("Liquidation Tx Hash:", liquidationTxHash);

  console.log("Waiting for liquidation consensus finalization...");
  const liquidationReceipt = await client.waitForTransactionReceipt({
    hash: liquidationTxHash,
    retries: 60,
    interval: 4000,
    fullTransaction: true,
  });
  console.log("Liquidation Status:", liquidationReceipt.statusName);
  console.log("Liquidation Result:", liquidationReceipt.result_name);

  console.log("\n=================================================");
  console.log("=== TX 4: Hard Peg Collateral Redemption ===");
  console.log("=================================================");
  const redeemAmountWei = BigInt("100000000000000000000"); // 100 aUSD
  console.log(`Redeeming 100 aUSD at hard peg for GEN collateral...`);
  const redemptionTxHash = await client.writeContract({
    address: deployedContractAddress,
    functionName: "redeem_collateral",
    args: [redeemAmountWei],
    value: BigInt(0),
  });
  console.log("Redemption Tx Hash:", redemptionTxHash);

  console.log("Waiting for redemption consensus finalization...");
  const redemptionReceipt = await client.waitForTransactionReceipt({
    hash: redemptionTxHash,
    retries: 60,
    interval: 4000,
    fullTransaction: true,
  });
  console.log("Redemption Status:", redemptionReceipt.statusName);
  console.log("Redemption Result:", redemptionReceipt.result_name);

  const finalState = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_state",
    args: [],
  });
  console.log("\nFinal Protocol State:", finalState);

  console.log("\n=================================================");
  console.log("=== SUMMARY OF NEW 4-TRANSACTION TRAIL ===");
  console.log("=================================================");
  console.log("Contract Address:", deployedContractAddress);
  console.log("Deploy Tx Hash:     ", deployTxHash);
  console.log("1. Rebalance Tx:    ", rebalanceTxHash);
  console.log("2. Mint Tx:         ", mintTxHash);
  console.log("3. Liquidation Tx:  ", liquidationTxHash);
  console.log("4. Redemption Tx:   ", redemptionTxHash);

  const summary = {
    contractAddress: deployedContractAddress,
    deploymentTxHash: deployTxHash,
    rebalanceTxHash: rebalanceTxHash,
    mintTxHash: mintTxHash,
    liquidationTxHash: liquidationTxHash,
    redemptionTxHash: redemptionTxHash,
    is_telemetry_verified: postRebalanceState.is_telemetry_verified,
    telemetry_source: postRebalanceState.telemetry_source,
    telemetry_timestamp: postRebalanceState.telemetry_timestamp,
    last_reasoning: postRebalanceState.last_reasoning,
    asset_price_usd: postRebalanceState.asset_price_usd,
    mint_collateral_ratio: postRebalanceState.mint_collateral_ratio,
    liquidation_ratio: postRebalanceState.liquidation_ratio,
    stability_fee_bps: postRebalanceState.stability_fee_bps,
    executedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.resolve(__dirname, "latest_deployment.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log("Saved full deployment & trail summary to latest_deployment.json");
}

main().catch((err) => {
  console.error("FATAL ERROR IN SCRIPT:", err);
  process.exit(1);
});
