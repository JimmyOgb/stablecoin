"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther, formatEther } from "viem";
import {
  getProtocolState,
  getUserPosition,
  getClient,
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
  Flame,
  Clock,
  Sparkles,
  Server,
  Send,
  DollarSign,
  Scale,
  X,
} from "lucide-react";

export default function Home() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Strictly use connected Web3 wallet address - NO silent burner key fallback
  const activeAddress = wagmiAddress;
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState<string>("0.5");
  const [mintAmount, setMintAmount] = useState<string>("500");
  const [burnAmount, setBurnAmount] = useState<string>("250");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("0.2");
  const [activeTab, setActiveTab] = useState<"mint" | "repay" | "liquidate" | "redeem">("mint");

  // Liquidation state
  const [liquidateBorrower, setLiquidateBorrower] = useState<string>("");
  const [liquidateDebt, setLiquidateDebt] = useState<string>("500");
  const [inspectedBorrowerPosition, setInspectedBorrowerPosition] = useState<UserPosition | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Peg Redemption state
  const [redeemAmount, setRedeemAmount] = useState<string>("100");

  // aUSD Transfer Modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState<string>("50");

  // Consensus & Transaction Progress Tracking
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [consensusStage, setConsensusStage] = useState<"idle" | "submitting" | "committing" | "revealing" | "accepted">("idle");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Autonomous Keeper State
  const [keeperStatus, setKeeperStatus] = useState<string | null>(null);
  const [isKeeperLoading, setIsKeeperLoading] = useState(false);

  // Format helpers
  const formatAusd = (val: number | string | undefined | null) => {
    if (!val) return "0.00";
    try {
      const b = BigInt(val.toString());
      return (Number(b) / 1e18).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  const formatGen = (val: number | string | undefined | null) => {
    if (!val) return "0.0000";
    try {
      const b = BigInt(val.toString());
      return (Number(b) / 1e18).toFixed(4);
    } catch {
      return (Number(val) / 1e18).toFixed(4);
    }
  };

  // Verify transaction execution result to prevent showing success on reverts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verifyExecution = (receipt: any) => {
    if (receipt?.statusName && !["ACCEPTED", "FINALIZED", "READY_TO_FINALIZE"].includes(receipt.statusName)) {
      throw new Error(`Transaction not accepted by consensus. Status: ${receipt.statusName}`);
    }
    const execStatus = receipt?.execution_result?.status || receipt?.txExecutionResultName;
    const isError =
      execStatus === "ERROR" ||
      execStatus === "REVERT" ||
      execStatus === "FAILURE" ||
      receipt?.txExecutionResultName === "FINISHED_WITH_ERROR" ||
      receipt?.txExecutionResult === 2;

    if (isError) {
      const errDetail =
        receipt?.execution_result?.error ||
        receipt?.execution_result?.revert_reason ||
        receipt?.execution_result?.message ||
        receipt?.revertReason ||
        "Transaction reverted on-chain during execution";
      throw new Error(`On-Chain Execution Revert: ${errDetail}`);
    }
  };

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
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    setIsProcessing(true);
    setActionStatus("Broadcasting AI Consensus Rebalance transaction...");
    setConsensusStage("submitting");
    setLastTxHash(null);
    setSuccessMessage(null);
    setError(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "rebalance_policy",
        args: [],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Stage 1/3: Committing - Validators capturing GEN market telemetry and running comparative consensus...");

      const revealTimer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Stage 2/3: Revealing - Validators independently verifying price within ±2% tolerance...");
      }, 7000);

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(revealTimer);
      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Stage 3/3: Consensus Reached! Status: ${receipt?.statusName || "ACCEPTED"}`);
      setSuccessMessage("Monetary policy successfully rebalanced with validator-checked GEN price!");
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
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    setIsProcessing(true);
    setActionStatus("Submitting collateral deposit & aUSD mint request via connected wallet...");
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);
      const weiValue = parseEther(depositAmount || "0");
      const aUsdToMintWei = parseEther(mintAmount || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "deposit_and_mint",
        args: [aUsdToMintWei],
        value: weiValue,
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Transaction broadcast. Validators committing consensus verification...");

      const timer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Validators verifying solvency invariants & finalizing block...");
      }, 5000);

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(timer);
      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Transaction finalized: ${receipt?.statusName || "ACCEPTED"}`);
      setSuccessMessage(`Vault deposit confirmed! Minted ${mintAmount} aUSD into your wallet against ${depositAmount} GEN.`);
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
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    setIsProcessing(true);
    setActionStatus("Submitting debt repayment & withdrawal via connected wallet...");
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);
      const burnWei = parseEther(burnAmount || "0");
      const withdrawWei = parseEther(withdrawAmount || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "repay_and_withdraw",
        args: [burnWei, withdrawWei],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Awaiting validator consensus commitment...");

      const timer = setTimeout(() => {
        setConsensusStage("revealing");
        setActionStatus("Verifying balance, debt burn, and emitting native GEN transfer...");
      }, 5000);

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      clearTimeout(timer);
      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Repay & Withdraw confirmed (${receipt?.statusName || "ACCEPTED"})`);
      setSuccessMessage(`Burned ${burnAmount} aUSD and unlocked ${withdrawAmount} GEN collateral!`);
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

  // Inspect Vault for Liquidation
  const handleInspectBorrower = async (addrToInspect?: string) => {
    const target = addrToInspect || liquidateBorrower;
    if (!target) return;
    setIsInspecting(true);
    try {
      const pos = await getUserPosition(target);
      setInspectedBorrowerPosition(pos);
    } catch (e) {
      console.error("Inspect error:", e);
    } finally {
      setIsInspecting(false);
    }
  };

  // Execute Liquidation with 10% Bonus
  const handleLiquidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    if (!liquidateBorrower) return;

    setIsProcessing(true);
    setActionStatus(`Liquidating ${liquidateBorrower.slice(0, 8)}... with 10% bonus`);
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);
      const debtToCoverWei = parseEther(liquidateDebt || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "liquidate",
        args: [liquidateBorrower, debtToCoverWei],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Validators verifying undercollateralized status and bonus payout...");

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Liquidation confirmed (${receipt?.statusName || "ACCEPTED"})`);
      setSuccessMessage(`Successfully liquidated vault! Burned ${liquidateDebt} aUSD and earned 10% bonus GEN collateral.`);
      await fetchData();
      if (liquidateBorrower) {
        await handleInspectBorrower(liquidateBorrower);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Liquidation failed: ${msg}`);
      setActionStatus(null);
      setConsensusStage("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Peg Arbitrage Redemption ($1.00 USD)
  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    setIsProcessing(true);
    setActionStatus("Executing Peg Arbitrage Redemption ($1.00 USD of GEN per aUSD)...");
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);
      const redeemWei = parseEther(redeemAmount || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "redeem",
        args: [redeemWei],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Validators verifying aUSD burn & emitting $1.00 peg GEN reserve redemption...");

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Peg Redemption confirmed (${receipt?.statusName || "ACCEPTED"})`);
      setSuccessMessage(`Redeemed ${redeemAmount} aUSD for GEN collateral at $1.00 peg floor!`);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Redemption failed: ${msg}`);
      setActionStatus(null);
      setConsensusStage("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  // Transfer aUSD to another account
  const handleTransferAusd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !wagmiAddress) {
      setError("Please connect your Web3 wallet to proceed.");
      return;
    }
    if (!transferRecipient) return;

    setIsProcessing(true);
    setActionStatus(`Transferring ${transferAmount} aUSD to ${transferRecipient.slice(0, 8)}...`);
    setConsensusStage("submitting");
    setError(null);
    setLastTxHash(null);
    setSuccessMessage(null);

    try {
      const client = getClient(wagmiAddress, typeof window !== "undefined" ? (window as any).ethereum : undefined);
      const amountWei = parseEther(transferAmount || "0");

      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "transfer",
        args: [transferRecipient, amountWei],
        value: BigInt(0),
      });

      setLastTxHash(txHash);
      setConsensusStage("committing");
      setActionStatus("Validators verifying ERC-20 transferable aUSD state transition...");

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        retries: 60,
        interval: 3000,
      });

      verifyExecution(receipt);

      setConsensusStage("accepted");
      setActionStatus(`Transfer confirmed (${receipt?.statusName || "ACCEPTED"})`);
      setSuccessMessage(`Transferred ${transferAmount} aUSD to ${transferRecipient}!`);
      setIsTransferModalOpen(false);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Transfer failed: ${msg}`);
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
  const currentMintCr = protocolState?.mint_collateral_ratio || protocolState?.collateral_ratio || 150;
  const liquidationCr = protocolState?.liquidation_ratio || 130;
  const currentCr = currentMintCr;
  const inputGen = parseFloat(depositAmount || "0");
  const inputUsdCol = inputGen * currentGenPrice;
  const inputMint = parseFloat(mintAmount || "0");
  const maxSafeMint = (inputUsdCol * 100) / currentMintCr;
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
                  Stablecoin Protocol
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block -mt-0.5">
                GenLayer Autonomous Monetary Policy & Liquidation Engine
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

        {/* User Token Wallet Bar (aUSD Asset Balance + Quick Transfer) */}
        <section className="rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/30 p-5 shadow-lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Your Transferable aUSD Asset</span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                    {userPosition ? formatAusd(userPosition.ausd_balance) : "0.00"}
                  </span>
                  <span className="text-sm font-bold text-purple-400">aUSD</span>
                  <span className="text-xs text-slate-500">($1.00 USD Peg Floor)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 w-full md:w-auto">
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="flex-1 md:flex-none inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-md shadow-indigo-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transfer aUSD</span>
              </button>
              <button
                onClick={() => setActiveTab("redeem")}
                className="flex-1 md:flex-none inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 border border-purple-500/30 text-xs font-semibold text-purple-200 transition-all"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Peg Redemption</span>
              </button>
            </div>
          </div>
        </section>

        {/* Transfer aUSD Modal */}
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Send className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">Transfer aUSD Token</h3>
                </div>
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleTransferAusd} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={transferRecipient}
                    onChange={(e) => setTransferRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Amount to Send (aUSD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="50"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                    <span>Available:</span>
                    <span className="text-indigo-400 font-mono font-medium">
                      {userPosition ? formatAusd(userPosition.ausd_balance) : "0.00"} aUSD
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!isConnected || isProcessing}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-md flex items-center justify-center space-x-2"
                  >
                    {!isConnected ? (
                      <>
                        <Wallet className="w-4 h-4" />
                        <span>Connect Wallet to Proceed</span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Transferring...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Confirm aUSD Transfer</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
                <span>Commitment Round</span>
              </div>

              <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 ${
                consensusStage === "revealing" || consensusStage === "accepted"
                  ? "bg-purple-900/40 border-purple-500/50 text-purple-200"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                <span className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Price & Risk Equivalence</span>
              </div>

              <div className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 ${
                consensusStage === "accepted"
                  ? "bg-emerald-900/40 border-emerald-500/50 text-emerald-200"
                  : "bg-slate-900 border-slate-800 text-slate-500"
              }`}>
                <span className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold">3</span>
                <span>Finalized State</span>
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
                Autonomous Central Bank Feed & Telemetry
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Mint Collateral Ratio</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState ? `${protocolState.mint_collateral_ratio ?? protocolState.collateral_ratio}%` : "150%"}
                </span>
                <span className="text-xs text-emerald-400 font-medium">Safe Mint Floor</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Minimum collateral ratio required to open or expand vault debt. Dynamically governed by AI consensus.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Liquidation Threshold</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState ? `${protocolState.liquidation_ratio ?? 130}%` : "130%"}
                </span>
                <span className="text-xs text-amber-400 font-medium">20% Safety Buffer</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Vaults falling below 130% become liquidatable with a 10% bonus paid to the liquidator.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Global Protocol Solvency</span>
                <Scale className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white">
                  {protocolState?.solvency_ratio_bps && protocolState.solvency_ratio_bps > 0
                    ? `${(protocolState.solvency_ratio_bps / 100).toFixed(1)}%`
                    : (Number(protocolState?.total_minted || 0) === 0 ? "100.0%" : "N/A")}
                </span>
                <span className="text-xs text-emerald-400 font-medium">Reserves / Debt</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Real-time protocol-wide collateralization. Redemptions require &ge;110% global solvency.
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Validator GEN Price</span>
                <ArrowDownUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white font-mono">
                  ${protocolState ? protocolState.asset_price_usd.toLocaleString() : "2,500"}
                </span>
                <span className="text-xs text-emerald-400 font-medium">±2% Equivalence</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Validator-verified GEN/USD telemetry. Disagreements &gt;2% are rejected by consensus.
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
                Continuous interest accrual clamped between 150 bps (1.5%) and 1200 bps (12.0%).
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800 p-5">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Total aUSD Circulating</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white font-mono">
                  {protocolState ? formatAusd(protocolState.total_minted) : "0.00"}
                </span>
                <span className="text-xs text-amber-400 font-medium">aUSD</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Backed by {protocolState ? formatGen(protocolState.total_collateral) : "0"} native GEN reserves.
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
                  disabled={!isConnected || isProcessing}
                  className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-all shadow-md shadow-indigo-600/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{!isConnected ? "Connect Wallet to Rebalance" : isProcessing ? "Rebalancing..." : "Trigger AI Rebalance"}</span>
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

        {/* Vault & Protocol Operations Workspace */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* User Vault State */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center space-x-2">
              <Wallet className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Your Vault Health</h2>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400">Vault Status</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${userPosition?.is_solvent ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="text-base font-bold text-white">
                      {userPosition ? (userPosition.is_solvent ? "Solvent & Healthy" : "Undercollateralized (Unsafe)") : "No Vault Found"}
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
                    {formatGen(userPosition?.collateral)} GEN
                    <span className="text-xs text-slate-500 ml-1.5">
                      (${userPosition ? userPosition.collateral_usd.toLocaleString() : "0"})
                    </span>
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Minted Debt</span>
                  <span className="font-mono font-medium text-purple-400">
                    {formatAusd(userPosition?.debt)} aUSD
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Max Borrow Capacity</span>
                  <span className="font-mono font-medium text-slate-300">
                    {formatAusd(userPosition?.max_debt)} aUSD
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Current Vault Ratio</span>
                  <span className="font-mono font-medium text-indigo-400">
                    {userPosition && Number(userPosition.debt) > 0 ? `${(userPosition.current_cr_bps / 100).toFixed(1)}%` : "∞ (No Debt)"}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Mint CR / Liq Threshold:</span>
                  <span className="font-mono text-slate-400">
                    {currentMintCr}% / {liquidationCr}% (20% Buffer)
                  </span>
                </div>

                <div className="flex justify-between py-1 pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400">Wallet aUSD Asset</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {formatAusd(userPosition?.ausd_balance)} aUSD
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
                    <span>Simulated CR: <strong>{simulatedRatio}%</strong> (Req: {currentMintCr}%)</span>
                  </div>
                  <span className={`font-semibold ${isSimulationSolvent ? "text-emerald-400" : "text-red-400"}`}>
                    {isSimulationSolvent ? "Solvent" : "Undercollateralized"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Operations Form & Modules */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <ArrowDownUp className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white tracking-tight">Protocol Modules</h2>
              </div>

              {/* 4 Navigation Tabs */}
              <div className="flex flex-wrap rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                <button
                  onClick={() => setActiveTab("mint")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "mint" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Deposit & Mint
                </button>
                <button
                  onClick={() => setActiveTab("repay")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "repay" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Repay & Withdraw
                </button>
                <button
                  onClick={() => setActiveTab("liquidate")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "liquidate" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Liquidation (+10%)
                </button>
                <button
                  onClick={() => setActiveTab("redeem")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === "redeem" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Peg Arbitrage
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
              {/* TAB 1: DEPOSIT & MINT */}
              {activeTab === "mint" && (
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
                      <span>Maximum safe borrow at {currentMintCr}% CR:</span>
                      <span className="font-mono text-slate-300">${maxSafeMint.toFixed(2)} aUSD</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!isConnected || isProcessing || !isSimulationSolvent}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center space-x-2"
                  >
                    {!isConnected ? (
                      <>
                        <Wallet className="w-4 h-4" />
                        <span>Connect Wallet to Proceed</span>
                      </>
                    ) : isProcessing ? (
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
              )}

              {/* TAB 2: REPAY & WITHDRAW */}
              {activeTab === "repay" && (
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
                      Burns outstanding vault debt to restore solvency headroom. Requires sufficient wallet aUSD balance.
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
                    disabled={!isConnected || isProcessing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center space-x-2"
                  >
                    {!isConnected ? (
                      <>
                        <Wallet className="w-4 h-4" />
                        <span>Connect Wallet to Proceed</span>
                      </>
                    ) : isProcessing ? (
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

              {/* TAB 3: LIQUIDATION ENGINE (10% BONUS) */}
              {activeTab === "liquidate" && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/20 p-4 text-xs text-indigo-300 space-y-1">
                    <div className="font-bold text-sm text-indigo-200 flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <span>Decentralized Liquidation Engine (10% Incentive Bonus)</span>
                    </div>
                    <p>
                      Any protocol participant can liquidate vaults that fall below the minimum Collateral Ratio ({currentCr}%).
                      Liquidators repay aUSD debt and receive the borrower’s GEN collateral at a <strong>10% discounted bonus</strong>.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Target Borrower Address
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={liquidateBorrower}
                        onChange={(e) => setLiquidateBorrower(e.target.value)}
                        placeholder="0x..."
                        className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleInspectBorrower()}
                        disabled={isInspecting || !liquidateBorrower}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white border border-slate-700"
                      >
                        {isInspecting ? "Inspecting..." : "Inspect Vault"}
                      </button>
                    </div>
                  </div>

                  {inspectedBorrowerPosition && (
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Position Health:</span>
                        <span className={`font-bold px-2 py-0.5 rounded-full ${
                          inspectedBorrowerPosition.is_solvent
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                        }`}>
                          {inspectedBorrowerPosition.is_solvent ? "Safe / Solvent" : "⚠️ UNSAFE - LIQUIDATABLE"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 font-mono text-slate-300 pt-1">
                        <div>Collateral: <strong className="text-white">{formatGen(inspectedBorrowerPosition.collateral)} GEN</strong></div>
                        <div>Valuation: <strong className="text-white">${inspectedBorrowerPosition.collateral_usd.toLocaleString()}</strong></div>
                        <div>Outstanding Debt: <strong className="text-purple-400">{formatAusd(inspectedBorrowerPosition.debt)} aUSD</strong></div>
                        <div>Current Ratio: <strong className="text-indigo-400">{(inspectedBorrowerPosition.current_cr_bps / 100).toFixed(1)}%</strong></div>
                      </div>

                      {!inspectedBorrowerPosition.is_solvent && (
                        <div className="pt-2 border-t border-slate-800/80 text-emerald-400">
                          Estimated 10% bonus on full debt: <strong>+{((Number(inspectedBorrowerPosition.debt) / 1e18) * 0.10).toFixed(2)} USD bonus in GEN</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleLiquidate} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Debt to Cover (aUSD)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={liquidateDebt}
                          onChange={(e) => setLiquidateDebt(e.target.value)}
                          placeholder="500"
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                          required
                        />
                        <span className="absolute right-4 top-3.5 text-sm font-semibold text-purple-400">aUSD</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1">
                        <span>Expected Seized GEN (10% Bonus):</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          ~{((parseFloat(liquidateDebt || "0") * 1.10) / currentGenPrice).toFixed(4)} GEN
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!isConnected || isProcessing || !liquidateBorrower}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-red-600/25 flex items-center justify-center space-x-2"
                    >
                      {!isConnected ? (
                        <>
                          <Wallet className="w-4 h-4" />
                          <span>Connect Wallet to Proceed</span>
                        </>
                      ) : isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Awaiting Validator Consensus (up to 180s)...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Execute Liquidation (Earn 10% Bonus)</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 4: PEG REDEMPTION ARBITRAGE */}
              {activeTab === "redeem" && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-purple-950/30 border border-purple-500/20 p-4 text-xs text-purple-300 space-y-2">
                    <div className="font-bold text-sm text-purple-200 flex items-center space-x-2">
                      <Scale className="w-4 h-4 text-purple-400" />
                      <span>Hard Peg Arbitrage Redemption ($1.00 USD Floor)</span>
                    </div>
                    <p className="leading-relaxed">
                      The protocol enforces a hard peg arbitrage floor: any user can burn aUSD to redeem exactly <strong>$1.00 USD worth of GEN collateral</strong> directly from protocol reserves (minus a 0.5% redemption fee).
                    </p>
                    <p className="text-slate-400">
                      If aUSD trades below $1 on secondary DEXs, arbitrageurs buy cheap aUSD and redeem it here for $1.00 of GEN, pocketing guaranteed risk-free profit and restoring the peg.
                    </p>
                  </div>

                  <form onSubmit={handleRedeem} className="space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Burn aUSD for Peg Redemption
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={redeemAmount}
                          onChange={(e) => setRedeemAmount(e.target.value)}
                          placeholder="100"
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white text-lg font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                          required
                        />
                        <span className="absolute right-4 top-3.5 text-sm font-semibold text-purple-400">aUSD</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1">
                        <span>Your aUSD balance:</span>
                        <span className="font-mono text-indigo-400">
                          {userPosition ? formatAusd(userPosition.ausd_balance) : "0.00"} aUSD
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-slate-400">
                        <span>Redemption Peg Value:</span>
                        <span className="text-white">$1.00 USD / aUSD</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Protocol Redemption Fee:</span>
                        <span className="text-slate-300">0.50% (50 bps)</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>GEN Collateral Price:</span>
                        <span className="text-white">${currentGenPrice.toLocaleString()} USD</span>
                      </div>
                      <div className="flex justify-between text-emerald-400 font-semibold pt-1 border-t border-slate-800">
                        <span>Estimated GEN Payout:</span>
                        <span>{((parseFloat(redeemAmount || "0") * 0.995) / currentGenPrice).toFixed(6)} GEN</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!isConnected || isProcessing || !redeemAmount}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 disabled:opacity-50 text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/25 flex items-center justify-center space-x-2"
                    >
                      {!isConnected ? (
                        <>
                          <Wallet className="w-4 h-4" />
                          <span>Connect Wallet to Proceed</span>
                        </>
                      ) : isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Awaiting Validator Consensus (up to 180s)...</span>
                        </>
                      ) : (
                        <>
                          <Scale className="w-4 h-4" />
                          <span>Execute Peg Redemption for GEN</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>Adaptive USD (aUSD) • Autonomous Stablecoin Protocol Powered by GenLayer Intelligent Consensus</p>
      </footer>
    </div>
  );
}
