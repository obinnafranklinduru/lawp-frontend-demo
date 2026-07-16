'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts, usePublicClient } from 'wagmi';
import { LAWPComplianceEngineABI, MockCNGNABI, LAWPImpactTokenABI, LAWPContributionPoolABI } from '../config/abis';
import { getContractAddress } from '../config/contracts';

export default function ContributorPortal() {
  const [mounted, setMounted] = useState(false);
  const [pools, setPools] = useState<any[]>([]);
  const [contributionAmounts, setContributionAmounts] = useState<{[key: string]: string}>({});
  const [localOverrides, setLocalOverrides] = useState<{[tokenId: number]: { pendingYield: number, yieldClaimed: number }}>({});

  const publicClient = usePublicClient();
  const { address, isConnected, chainId } = useAccount();
  const { writeContract, writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isWaiting, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (receiptError) {
      setErrorMsg("Transaction failed on-chain: " + receiptError.message);
      setSuccessMsg(null);
    }
  }, [receiptError]);

  const fetchPools = async () => {
    try {
      const res = await fetch('/api/pools');
      if (res.ok) setPools(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchPools();
    const interval = setInterval(fetchPools, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fallback to hardcoded for demo visuals, but use wagmi state for logic
  const isDemoConnected = mounted ? (isConnected || true) : true;

  const engineAddress = getContractAddress(chainId, 'LAWPComplianceEngine') as `0x${string}`;
  const mockTokenAddress = getContractAddress(chainId, 'MockCNGN') as `0x${string}`;
  const impactTokenAddress = getContractAddress(chainId, 'LAWPImpactToken') as `0x${string}`;
  const contributionPoolAddress = getContractAddress(chainId, 'LAWPContributionPool') as `0x${string}`;

  // Batch query token IDs 1 to 20 for local demo
  const tokenIdsToQuery = Array.from({length: 20}, (_, i) => BigInt(i + 1));
  const batchContracts = tokenIdsToQuery.flatMap(id => [
    { address: impactTokenAddress, abi: LAWPImpactTokenABI as any, functionName: 'ownerOf', args: [id] },
    { address: impactTokenAddress, abi: LAWPImpactTokenABI as any, functionName: 'getTokenData', args: [id] },
    { address: engineAddress, abi: LAWPComplianceEngineABI as any, functionName: 'calculateProportionalYield', args: [id] },
    { address: engineAddress, abi: LAWPComplianceEngineABI as any, functionName: 'yieldClaimed', args: [id] }
  ]);

  const { data: batchData, refetch: refetchBatchData } = useReadContracts({ 
    contracts: batchContracts,
    query: {
      enabled: isConnected && !!address
    }
  });

  const poolContracts = pools.map(p => ({
    address: contributionPoolAddress,
    abi: LAWPContributionPoolABI as any,
    functionName: 'getPool',
    args: [BigInt(p.id)]
  }));

  const { data: poolData, refetch: refetchPoolData } = useReadContracts({
    contracts: poolContracts,
    query: {
      enabled: pools.length > 0
    }
  });

  // Refetch on-chain data when a transaction confirms
  useEffect(() => {
    if (isConfirmed) {
      refetchPoolData();
      refetchBatchData();
    }
  }, [isConfirmed, refetchPoolData, refetchBatchData]);

  const portfolio = tokenIdsToQuery.map((tokenIdBigInt, index) => {
    const baseIdx = index * 4;
    const ownerRes = batchData?.[baseIdx];
    
    // Only show tokens owned by connected address
    if (ownerRes?.status !== 'success' || ownerRes.result !== address) return null;

    const tDataRes = batchData?.[baseIdx + 1];
    const yDataRes = batchData?.[baseIdx + 2];
    const yClaimedRes = batchData?.[baseIdx + 3];

    if (tDataRes?.status !== 'success') return null;
    const tokenData: any = tDataRes.result;

    let pendingYieldNum = yDataRes?.status === 'success' ? Number(yDataRes.result) / 1e6 : 0;
    let yieldClaimedNum = yClaimedRes?.status === 'success' ? Number(yClaimedRes.result) / 1e6 : 0;
    
    if (localOverrides[Number(tokenIdBigInt)]) {
      pendingYieldNum = localOverrides[Number(tokenIdBigInt)].pendingYield;
      yieldClaimedNum = localOverrides[Number(tokenIdBigInt)].yieldClaimed;
    }

    const rocReturnedNum = Number(tokenData.rocReturned) / 1e6;
    
    const poolIdx = pools.findIndex(p => parseInt(p.id) === Number(tokenData.poolId));
    const sharePercentage = (Number(tokenData.poolShareWAD) / 1e18) * 100;
    const pool = pools[poolIdx];

    return {
      tokenId: Number(tokenIdBigInt),
      poolName: pool ? pool.name : `Pool #${tokenData.poolId}`,
      sharePercentage: sharePercentage.toFixed(2) + '%',
      pendingYield: pendingYieldNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      yieldClaimed: yieldClaimedNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rocReturned: rocReturnedNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      rawPendingYield: pendingYieldNum,
      rawYieldClaimed: yieldClaimedNum
    };
  }).filter(Boolean) as any[];

  const handleFaucet = () => {
    if (!address) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: mockTokenAddress,
      abi: MockCNGNABI as any,
      functionName: 'mint',
      args: [address, BigInt(10000) * BigInt(1e6)], // 10,000 cNGN (6 decimals)
    }, {
      onSuccess: () => setSuccessMsg("10,000 cNGN minted successfully! Wait for confirmation."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to mint")
    });
  };

  const handleContribute = async (poolId: string, poolName: string) => {
    try {
      const amountStr = contributionAmounts[poolId] || "1000";
      const amountNum = parseFloat(amountStr);
      if (isNaN(amountNum) || amountNum < 100) {
        setErrorMsg("Minimum contribution is 100 cNGN.");
        return;
      }
      const amountInWei = BigInt(Math.floor(amountNum * 1e6));

      setErrorMsg(null);
      setSuccessMsg(`Preparing contribution for ${poolName}...`);

      if (!publicClient) throw new Error("Public client not found");

      // 1. Check Allowance
      const allowance = await publicClient.readContract({
        address: mockTokenAddress,
        abi: MockCNGNABI,
        functionName: 'allowance',
        args: [address as `0x${string}`, contributionPoolAddress]
      }) as bigint;

      // 2. Approve if needed
      if (allowance < amountInWei) {
        setSuccessMsg("Please approve the token spend limit in your wallet...");
        const approveHash = await writeContractAsync({
          address: mockTokenAddress,
          abi: MockCNGNABI as any,
          functionName: 'approve',
          args: [contributionPoolAddress, amountInWei]
        });
        setSuccessMsg("Waiting for approval confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 3. Contribute
      setSuccessMsg("Please confirm the contribution transaction...");
      const txHash = await writeContractAsync({
        address: contributionPoolAddress,
        abi: LAWPContributionPoolABI as any,
        functionName: 'contribute',
        args: [BigInt(poolId), amountInWei]
      });
      setSuccessMsg("Contribution submitted! Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      if (receipt.status === 'reverted') throw new Error("Contribution reverted on-chain.");

      setSuccessMsg(`Successfully contributed ${amountNum.toLocaleString()} cNGN to ${poolName}!`);
      refetchPoolData();
    } catch (err: any) {
      setErrorMsg(err.shortMessage || err.message || `Failed to contribute to ${poolName}`);
      setSuccessMsg(null);
    }
  };

  const handleClaimYield = async (tokenId: number) => {
    try {
      setErrorMsg(null);
      setSuccessMsg("Please confirm the claim transaction...");
      const txHash = await writeContractAsync({
        address: engineAddress,
        abi: LAWPComplianceEngineABI,
        functionName: 'claimYield',
        args: [BigInt(tokenId)],
      });
      setSuccessMsg("Claim submitted! Waiting for confirmation...");
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
      if (receipt?.status === 'reverted') throw new Error("Claim reverted on-chain.");
      
      const token = portfolio.find(t => t.tokenId === tokenId);
      if (token) {
        setLocalOverrides(prev => ({
          ...prev, 
          [tokenId]: { 
            pendingYield: 0, 
            yieldClaimed: token.rawYieldClaimed + token.rawPendingYield 
          }
        }));
      }
      refetchBatchData();
      
      setSuccessMsg("Tokens claimed successfully!");
    } catch (err: any) {
      setErrorMsg(err.shortMessage || err.message || "Failed to claim tokens");
      setSuccessMsg(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Contributor Portal</h2>
          <p className="text-[var(--color-brand-text-muted)] mt-2">Support social impact projects and earn grants.</p>
        </div>
        <Button onClick={handleFaucet} variant="secondary" disabled={!isDemoConnected || isPending || isWaiting}>
          {isPending ? 'Minting...' : 'Faucet (10,000 cNGN)'}
        </Button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}
      
      {successMsg && (
        <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200 text-sm">
          <strong>Notice:</strong> {successMsg}
        </div>
      )}

      <div className="bg-white/5 border border-[var(--color-brand-border)] p-6 rounded-xl mb-8">
        <h3 className="text-xl font-bold mb-4 text-[var(--color-brand-primary)]">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
           <div><strong className="text-white block mb-1">1. Get Tokens</strong> Use the Faucet to receive testnet cNGN tokens.</div>
           <div><strong className="text-white block mb-1">2. Choose Pool</strong> Select an active impact project and set your contribution amount (Min. 100).</div>
           <div><strong className="text-white block mb-1">3. Contribute</strong> Confirm the transaction to receive your fractional Impact Token.</div>
           <div><strong className="text-white block mb-1">4. Earn Grants</strong> As projects generate revenue, claim your programmatic grants directly to your wallet.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Active Pools">
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {!mounted || pools.length === 0 ? (
               <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                 No active pools.
               </div>
            ) : (
              pools.map((pool, index) => {
               let raised = 0;
               if (poolData && poolData[index] && poolData[index].status === 'success') {
                 const res = poolData[index].result as any;
                 raised = Number(res.totalRaised) / 1e6;
               }
               
               const progress = (raised / parseInt(pool.goal)) * 100;

               return (
                <div key={pool.id} className="p-4 border border-[var(--color-brand-border)] rounded-lg bg-white/5 flex flex-col gap-3 hover:bg-white/10 transition cursor-pointer">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">{pool.name}</span>
                    <span className={`text-sm px-2 py-1 rounded bg-white/10 ${pool.status === 'Open' ? 'text-[var(--color-brand-primary)]' : 'text-[var(--color-brand-success)]'}`}>
                      {pool.status}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${progress >= 100 ? 'bg-[var(--color-brand-success)]' : 'bg-gradient-to-r from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)]'}`} 
                      style={{ width: `${Math.min(100, progress)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm text-[var(--color-brand-text-muted)]">
                    <span>{raised.toLocaleString()} cNGN Raised</span>
                    <span>Goal: {parseInt(pool.goal).toLocaleString()} cNGN</span>
                  </div>
                  {pool.status === 'Open' && (
                    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-white/5">
                      <div className="flex gap-2 items-center">
                        <input 
                          type="number" 
                          min="100"
                          placeholder="Amount (e.g. 1000)"
                          className="bg-white/5 border border-[var(--color-brand-border)] rounded px-3 py-2 w-full text-white outline-none focus:border-[var(--color-brand-primary)] transition"
                          value={contributionAmounts[pool.id] !== undefined ? contributionAmounts[pool.id] : '1000'}
                          onChange={(e) => setContributionAmounts({...contributionAmounts, [pool.id]: e.target.value})}
                        />
                        <span className="text-[var(--color-brand-text-muted)] text-sm whitespace-nowrap">cNGN</span>
                      </div>
                      <Button 
                        fullWidth 
                        onClick={() => handleContribute(pool.id, pool.name)}
                        disabled={isPending || isWaiting}
                        className="shadow-[0_0_15px_var(--color-brand-primary)]"
                      >
                        Contribute
                      </Button>
                    </div>
                  )}
                </div>
               );
             })
            )}
          </div>
        </Card>
        
        <Card title="Your Portfolio" variant={isDemoConnected ? 'highlight' : 'default'}>
          {!isDemoConnected ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center text-[var(--color-brand-text-muted)]">
              <svg className="w-12 h-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p>Connect your wallet to view your Impact Tokens and claim yield.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
               {portfolio.length === 0 ? (
                 <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                   No Impact Tokens found in your portfolio.
                 </div>
               ) : (
                 portfolio.map((token) => (
                   <div key={token.tokenId} className="p-4 border border-[var(--color-brand-border)] rounded-lg bg-white/5 flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <div>
                          <span className="font-bold block">Token #{token.tokenId}</span>
                          <span className="text-sm text-[var(--color-brand-text-muted)]">{token.poolName}</span>
                        </div>
                        <span className="text-xs bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-primary)] px-2 py-1 rounded border border-[var(--color-brand-primary)]/30">
                          {token.sharePercentage} Share
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                        <span className="text-[var(--color-brand-text-muted)]">Available Balance:</span>
                        <span className="text-right text-[var(--color-brand-success)] font-mono">{token.pendingYield} cNGN</span>
                        
                        <span className="text-[var(--color-brand-text-muted)]">Total Claimed:</span>
                        <span className="text-right text-purple-400 font-mono">{token.yieldClaimed} cNGN</span>
                        
                        <span className="text-[var(--color-brand-text-muted)]">Refunded (RoC):</span>
                        <span className="text-right text-blue-400 font-mono">{token.rocReturned} cNGN</span>
                      </div>
                      <div className="mt-3">
                        <Button 
                          fullWidth 
                          variant="ghost" 
                          className="border border-[var(--color-brand-success)]/50 text-[var(--color-brand-success)] hover:bg-[var(--color-brand-success)]/10"
                          onClick={() => handleClaimYield(token.tokenId)}
                          disabled={token.rawPendingYield === 0 || isPending || isWaiting}
                        >
                          Claim Available Balance
                        </Button>
                      </div>
                   </div>
                 ))
               )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
