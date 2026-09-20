const fs = require("fs");
const path = require("path");
const { createClient, createAccount, chains } = require("genlayer-js");
const keytar = require("C:/Users/NO GO NO/AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar");

async function main() {
  console.log("=== STEP 1: Setting up Deployer & Client ===");
  const privKey = await keytar.getPassword("genlayer-cli", "account:ace-deployer");
  if (!privKey) {
    throw new Error("Could not find private key for ace-deployer in OS keychain");
  }
  const account = createAccount(privKey);
  console.log("Deployer Address:", account.address);

  const client = createClient({
    chain: chains.studionet,
    endpoint: "https://studio.genlayer.com/api",
    account: account,
  });

  const contractPath = path.resolve(__dirname, "../../contracts/monetary_policy.py");
  const code = fs.readFileSync(contractPath, "utf8");
  console.log("Contract code loaded:", contractPath, `(${code.length} bytes)`);

  console.log("\n=== STEP 2: Deploying Contract to StudioNet ===");
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
    leaderOnly: false,
  });
  console.log("Deploy Transaction Hash:", deployTxHash);

  console.log("Waiting for deployment receipt...");
  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 60,
    interval: 5000,
    fullTransaction: true,
  });

  console.log("Deploy Status:", deployReceipt.statusName);
  console.log("Deploy Result:", deployReceipt.result_name);

  // Extract deployed contract address
  const deployedContractAddress =
    deployReceipt.data?.contract_address ??
    deployReceipt.recipient ??
    deployReceipt.txDataDecoded?.contractAddress;

  console.log("Deployed Contract Address:", deployedContractAddress);

  if (!deployedContractAddress) {
    throw new Error("Failed to resolve deployed contract address from receipt");
  }

  console.log("\n=== STEP 3: Verifying Genesis State ===");
  const genesisState = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_state",
    args: [],
  });
  console.log("Genesis State:", JSON.stringify(genesisState, null, 2));

  console.log("\n=== STEP 4: Executing Live rebalance_policy() Transaction ===");
  const rebalanceTxHash = await client.writeContract({
    address: deployedContractAddress,
    functionName: "rebalance_policy",
    args: [],
    value: BigInt(0),
  });
  console.log("Rebalance Transaction Hash:", rebalanceTxHash);

  console.log("Waiting for rebalance consensus finalization (5/5 validators)...");
  const rebalanceReceipt = await client.waitForTransactionReceipt({
    hash: rebalanceTxHash,
    retries: 60,
    interval: 5000,
    fullTransaction: true,
  });

  console.log("Rebalance Status:", rebalanceReceipt.statusName);
  console.log("Rebalance Result:", rebalanceReceipt.result_name);

  console.log("\n=== STEP 5: Verifying Post-Rebalance State & Telemetry ===");
  const postState = await client.readContract({
    address: deployedContractAddress,
    functionName: "get_state",
    args: [],
  });
  console.log("Post-Rebalance State:", JSON.stringify(postState, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log("Contract Address:", deployedContractAddress);
  console.log("Deployment Tx Hash:", deployTxHash);
  console.log("Rebalance Tx Hash:", rebalanceTxHash);
  console.log("is_telemetry_verified:", postState.is_telemetry_verified);
  console.log("telemetry_source:", postState.telemetry_source);
  console.log("telemetry_timestamp:", postState.telemetry_timestamp);
  console.log("last_reasoning:", postState.last_reasoning);

  // Write deployment info to JSON file for frontend and README updates
  const summary = {
    contractAddress: deployedContractAddress,
    deploymentTxHash: deployTxHash,
    rebalanceTxHash: rebalanceTxHash,
    is_telemetry_verified: postState.is_telemetry_verified,
    telemetry_source: postState.telemetry_source,
    telemetry_timestamp: postState.telemetry_timestamp,
    last_reasoning: postState.last_reasoning,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.resolve(__dirname, "latest_deployment.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log("Saved summary to latest_deployment.json");
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
