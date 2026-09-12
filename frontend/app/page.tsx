"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import {
  getProtocolState,
  getUserPosition,
  getClient,
  createAccount,
  generatePrivateKey,
  CONTRACT_ADDRESS,
  RPC_URL,
  type ProtocolState,
  type UserPosition,
} from "@/lib/genlayer";
import {
  Cpu,
  ShieldCheck,
  Percent,
  Coins,
  ArrowDownUp,
  RefreshCw,
  Wallet,
  Activity,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Copy,
  Zap,
  Lock,
  Flame,
  Clock,
  Sparkles,
  Server,
} from "lucide-react";

export default function Home() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fallback / Session key account for gasless testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sessionAccount, setSessionAccount] = useState<any>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Active address: prioritize Wagmi connected wallet, fallback to session account
  const activeAddress = wagmiAddress || sessionAccount?.address;

  // Form states
  const [depositAmount, setDepositAmount] = useState<string>("0.5");
  const [mintAmount, setMintAmount] = useState<string>("500");
  const [burnAmount, setBurnAmount] = useState<string>("250");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("0.2");
  const [activeTab, setActiveTab] = useState<"mint" | "repay">("mint");

  // Consensus & Transaction Progress Tracking
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [consensusStage, setConsensusStage] = useState<"idle" | "submitting" | "committing" | "revealing" | "accepted">("idle");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Autonomous Keeper State
  const [keeperStatus, setKeeperStatus] = useState<string | null>(null);
  const [isKeeperLoading, setIsKeeperLoading] = useState(false);

  // Initialize session key
  useEffect(() => {
    try {
      let key = localStorage.getItem("genlayer_stablecoin_key");
      if (!key) {
        key = generatePrivateKey();
        localStorage.setItem("genlayer_stablecoin_key", key);
      }
      const acc = createAccount(key as `0x${string}`);
      setSessionAccount(acc);
    } catch (e) {
      console.error("Account init error:", e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const state = await getProtocolState();
      setProtocolState(state);

      if (activeAddress) {
        const pos = await getUserPosition(activeAddress);
        setUserPosition(pos);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Fetch state error:", msg);
      setError("Failed to fetch live contract state from GenLayer StudioNet.");
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 12000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // AI Consensus Policy Rebalance Trigger
  const handleRebalance = async () => {
    if (!sessionAccount && !isConnected) return;
    setIsProcessing(true);
    setActionStatus("Broadcasting AI Consensus Rebalance transaction...");
    setConsensusStage("submitting");
    setLastTxHash(null);
    setSuccessMessage(null);
    setError(null);

    try {
      const client = getClient(sessionAccount);

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "rebalance_policy",
        args: [],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Stage 1/3: Committing - Validators fetching CoinGecko telemetry & running prompt consensus...");

      // Simulate step progression visual for validator deliberation
      const revealTimer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Stage 2/3: Revealing - Exchanging comparative LLM results & validating circuit breakers...");
      }, 7000);

      // Robust polling: 60 retries * 3000ms = 180s timeout window
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(revealTimer);
      setConsensusStage("accepted");
      setActionStatus(`Stage 3/3: Consensus Reached! Status: ${receipt?.statusName || "ACCEPTED"}`);
      setSuccessMessage("Monetary policy successfully rebalanced by validator consensus!");
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Rebalance failed: ${msg}`);
      setActionStatus(null);
      setConsensusStage("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Deposit Collateral (GEN) & Borrow aUSD
  const handleDepositAndMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionAccount && !isConnected) return;
    setIsProcessing(true);
    setActionStatus("Submitting collateral deposit & mint request...");
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(sessionAccount);
      const weiValue = parseEther(depositAmount || "0");
      const aUsdToMint = parseInt(mintAmount || "0", 10);

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "deposit_and_mint",
        args: [aUsdToMint],
        value: weiValue,
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Transaction broadcast. Validators committing consensus verification...");

      const timer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Validators verifying solvency invariants & finalizing block...");
      }, 5000);

      // 60 retries * 3000ms = 180s
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(timer);
      setConsensusStage("accepted");
      setActionStatus(`Transaction finalized: ${receipt?.statusName || "ACCEPTED"}`);
      setSuccessMessage(`Vault deposit confirmed! Minted ${aUsdToMint} aUSD against ${depositAmount} GEN.`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Mint failed: ${msg}`);
      setActionStatus(null);
      setConsensusStage("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Repay aUSD & Withdraw Collateral (GEN)
  const handleRepayAndWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionAccount && !isConnected) return;
    setIsProcessing(true);
    setActionStatus("Submitting debt repayment & withdrawal...");
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(sessionAccount);
      const burn = parseInt(burnAmount || "0", 10);
      const withdrawWei = parseEther(withdrawAmount || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "repay_and_withdraw",
        args: [burn, withdrawWei],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Awaiting validator consensus commitment...");

      const timer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Verifying remaining solvency and emitting native transfer...");
      }, 5000);

      // 60 retries * 3000ms = 180s
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(timer);
      setConsensusStage("accepted");
      setActionStatus(`Repay & Withdraw confirmed (${receipt?.statusName || "ACCEPTED"})`);
      setSuccessMessage(`Burned ${burn} aUSD and unlocked ${withdrawAmount} GEN collateral!`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Repay/Withdraw failed: ${msg}`);
      setActionStatus(null);
      setConsensusStage("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Autonomous Keeper Webhook Trigger
  const handleTestKeeper = async () => {
    setIsKeeperLoading(true);
    setKeeperStatus(null);
    try {
      const res = await fetch("/api/rebalance", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setKeeperStatus(`Autonomous Keeper confirmed tx: ${data.transactionHash.slice(0, 16)}... (Status: ${data.receiptStatus})`);
        await fetchData();
      } else {
        setKeeperStatus(`Keeper error: ${data.error || "Failed"}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setKeeperStatus(`Webhook error: ${msg}`);
    } finally {
      setIsKeeperLoading(false);
    }
  };

  const copyAddress = () => {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  // Solvency calculations for active input
  const currentGenPrice = protocolState?.asset_price_usd || 2500;
  const currentCr = protocolState?.collateral_ratio || 150;
  const inputGen = parseFloat(depositAmount || "0");
  const inputUsdCol = inputGen * currentGenPrice;
  const inputMint = parseFloat(mintAmount || "0");
  const maxSafeMint = (inputUsdCol * 100) / currentCr;
  const simulatedRatio = inputMint > 0 ? ((inputUsdCol * 100) / inputMint).toFixed(1) : "∞";
  const isSimulationSolvent = inputMint <= maxSafeMint;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">aUSD</span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Adaptive Stablecoin
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block -mt-0.5">
                GenLayer Intelligent Autonomous Monetary Policy
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">StudioNet (61999)</span>
            </div>

            {/* RainbowKit WalletConnect Button */}
            <ConnectButton showBalance={false} chainStatus="icon" />

            {/* Session Address Quick Copy */}
            {activeAddress && (
              <button
                onClick={copyAddress}
                className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 transition-colors"
                title="Active Account Address"
              >
                <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
                </span>
                {copiedAddress ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 opacity-60" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Network & Contract Deployment Banner */}
        <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-medium text-slate-300">Deployed Contract:</span>
            <code className="bg-slate-950 px-2 py-0.5 rounded text-indigo-300 font-mono select-all">
              {CONTRACT_ADDRESS}
            </code>
          </div>
          <div className="flex items-center space-x-4">
            <span>RPC: <span className="text-slate-300">{RPC_URL}</span></span>
            <a
              href="https://genlayer-explorer.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Explorer <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        </div>

        {/* Alerts & Errors */}
        {error && (
          <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-4 text-red-300 text-sm flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Error Occurred</div>
              <div className="text-xs opacity-90">{error}</div>
            </div>
          </div>
        )}

        {/* Real-time Consensus Deliberation Tracker */}
        {consensusStage !== "idle" && (
          <div className="rounded-2xl bg-gradient-to-r from-indigo-950/60 via-purple-950/60 to-slate-900 border border-indigo-500/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-indigo-400 animate-spin" />
                <span className="font-bold text-sm text-white">GenLayer AI Validator Consensus</span>
              </div>
              <span className="text-xs font-mono text-indigo-300 bg-indigo-900/50 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                {consensusStage.toUpperCase()}
              </span>
            </div>

            {/* Stepper */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 ${
                consensusStage === "submitting" || consensusStage === "committing" || consensusStage === "revealing" || consensusStage === "accepted"
                  ? "bg-indigo-900/40 border-indigo-500/50 text-indigo-200"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                <span className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Submitting & Commit</span>
              </div>

              <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 ${
                consensusStage === "revealing" || consensusStage === "accepted"
                  ? "bg-purple-900/40 border-purple-500/50 text-purple-200"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                <span className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Revealing & Equivalence</span>
              </div>

              <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 ${
                consensusStage === "accepted"
                  ? "bg-emerald-900/40 border-emerald-500/50 text-emerald-200"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                <span className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Accepted & Finalized</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono pt-1">{actionStatus}</p>
            {lastTxHash && (
              <div className="text-[11px] text-slate-400 font-mono break-all bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                <span>Tx Hash: {lastTxHash}</span>
                <a
                  href={`https://genlayer-explorer.vercel.app`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 ml-2"
                >
                  Verify Explorer ↗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div className="rounded-xl bg-emerald-950/50 border border-emerald-800/80 p-4 text-emerald-300 text-sm flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <div className="flex-1 font-medium">{successMessage}</div>
          </div>
        )}

        {/* Central Bank Macro Metrics */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Autonomous Central Bank Feed
              </h2>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Telemetry</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>AI Collateral Ratio</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState ? `${protocolState.collateral_ratio}%` : "150%"}
                </span>
                <span className="text-xs text-emerald-400 font-medium">Bounds: 120-200%</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Dynamically governed by validator LLM deliberation based on live market volatility.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Stability Borrow Fee</span>
                <Percent className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState ? `${(protocolState.stability_fee_bps / 100).toFixed(2)}%` : "3.00%"}
                </span>
                <span className="text-xs text-slate-400">
                  {protocolState ? `${protocolState.stability_fee_bps} bps` : "300 bps"}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Annual borrow fee clamped between 150 bps (1.5%) and 1200 bps (12.0%).
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Collateral Oracle Price</span>
                <ArrowDownUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  ${protocolState ? protocolState.asset_price_usd.toLocaleString() : "2,500"}
                </span>
                <span className="text-xs text-slate-400">GEN/USD</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Fetched on-chain via gl.nondet.web during consensus rebalances.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Total aUSD Minted</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState ? protocolState.total_minted.toLocaleString() : "0"}
                </span>
                <span className="text-xs text-amber-400 font-medium">aUSD</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Global circulating algorithmic stablecoins backed by native GEN.
              </p>
            </div>
          </div>

          {/* AI Reasoning Telemetry Box */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm text-white">
                  Consensus Macroeconomic Rationale
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRebalance}
                  disabled={isProcessing}
                  className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-md shadow-indigo-600/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Trigger AI Rebalance</span>
                </button>

                <button
                  onClick={handleTestKeeper}
                  disabled={isKeeperLoading}
                  className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 transition-all border border-slate-700"
                >
                  <Server className="w-3.5 h-3.5 text-purple-400" />
                  <span>{isKeeperLoading ? "Triggering..." : "Autonomous Keeper Webhook"}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4">
              <div className="flex items-center space-x-2 mb-2 text-xs text-indigo-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>On-Chain Consensus State (`last_reasoning`):</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed italic">
                &ldquo;{protocolState?.last_reasoning || "Genesis monetary policy: Normal volatility conditions. Base CR set to 150%, stability fee 300 bps."}&rdquo;
              </p>
            </div>

            {keeperStatus && (
              <p className="text-xs text-purple-300 font-mono bg-purple-950/30 border border-purple-800/50 p-2.5 rounded-lg">
                {keeperStatus}
              </p>
            )}
          </div>
        </section>

        {/* Vault & Borrowing Terminal */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Position Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center space-x-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Your Vault Position</h2>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400">Solvency Status</span>
                  <div className="mt-1 flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${userPosition?.is_solvent !== false ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                    <span className="font-bold text-white">
                      {userPosition?.is_solvent !== false ? "Solvent & Healthy" : "At Risk"}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400">Current Borrow Fee</span>
                  <div className="text-sm font-semibold text-emerald-400 mt-1">
                    {protocolState ? `${(protocolState.stability_fee_bps / 100).toFixed(2)}% APY` : "3.00%"}
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Locked Collateral</span>
                  <span className="font-mono font-medium text-white">
                    {userPosition ? (userPosition.collateral / 1e18).toFixed(4) : "0.0000"} GEN
                    <span className="text-xs text-slate-500 ml-1.5">
                      (${userPosition ? userPosition.collateral_usd.toLocaleString() : "0"})
                    </span>
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Minted Debt</span>
                  <span className="font-mono font-medium text-purple-400">
                    {userPosition ? userPosition.debt.toLocaleString() : "0"} aUSD
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Max Borrow Capacity</span>
                  <span className="font-mono font-medium text-slate-300">
                    {userPosition ? userPosition.max_debt.toLocaleString() : "0"} aUSD
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Current Vault Ratio</span>
                  <span className="font-mono font-medium text-indigo-400">
                    {userPosition && userPosition.debt > 0 ? `${(userPosition.current_cr_bps / 100).toFixed(1)}%` : "∞ (No Debt)"}
                  </span>
                </div>
              </div>

              {activeTab === "mint" && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                  isSimulationSolvent ? "bg-slate-950/60 border-slate-800 text-slate-300" : "bg-red-950/40 border-red-800/80 text-red-300"
                }`}>
                  <div className="flex items-center space-x-2">
                    {isSimulationSolvent ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span>Simulated CR: <strong>{simulatedRatio}%</strong> (Req: {currentCr}%)</span>
                  </div>
                  <span className={`font-semibold ${isSimulationSolvent ? "text-emerald-400" : "text-red-400"}`}>
                    {isSimulationSolvent ? "Solvent" : "Undercollateralized"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Operations Form */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ArrowDownUp className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white tracking-tight">Vault Operations</h2>
              </div>

              <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                <button
                  onClick={() => setActiveTab("mint")}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "mint" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Deposit & Mint
                </button>
                <button
                  onClick={() => setActiveTab("repay")}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "repay" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Repay & Withdraw
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
              {activeTab === "mint" ? (
                <form onSubmit={handleDepositAndMint} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Deposit Collateral (GEN)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.5"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        required
                      />
                      <span className="absolute right-4 top-3.5 text-sm font-semibold text-indigo-400">GEN</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Native GenLayer token deposited directly to contract storage via @gl.public.write.payable.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Borrow aUSD (Stablecoin Mint)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={mintAmount}
                        onChange={(e) => setMintAmount(e.target.value)}
                        placeholder="500"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        required
                      />
                      <span className="absolute right-4 top-3.5 text-sm font-semibold text-purple-400">aUSD</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1">
                      <span>Maximum borrowing capacity at {currentCr}% CR:</span>
                      <span className="font-mono text-slate-300">${maxSafeMint.toFixed(2)} aUSD</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing || !isSimulationSolvent}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Awaiting Validator Consensus (up to 180s)...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Deposit Native GEN & Mint aUSD</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRepayAndWithdraw} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Repay aUSD (Stablecoin Burn)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={burnAmount}
                        onChange={(e) => setBurnAmount(e.target.value)}
                        placeholder="250"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        required
                      />
                      <span className="absolute right-4 top-3.5 text-sm font-semibold text-purple-400">aUSD</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Burns outstanding vault debt to restore solvency headroom.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Withdraw Collateral (GEN)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.2"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                        required
                      />
                      <span className="absolute right-4 top-3.5 text-sm font-semibold text-indigo-400">GEN</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Transfers native GEN back to your address upon solvency validation.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Awaiting Validator Consensus (up to 180s)...</span>
                      </>
                    ) : (
                      <>
                        <Flame className="w-4 h-4" />
                        <span>Repay aUSD & Withdraw GEN</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>Adaptive Monetary Policy Protocol • Powered by GenLayer Intelligent Consensus</p>
      </footer>
    </div>
  );
}
