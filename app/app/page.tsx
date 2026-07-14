'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContracts } from 'wagmi';
import { LAWPComplianceEngineABI, MockCNGNABI, LAWPImpactTokenABI, LAWPContributionPoolABI } from '../config/abis';
import { getContractAddress } from '../config/contracts';

export default function InvestorPortal() {
  const [mounted, setMounted] = useState(false);
  const [pools, setPools] = useState<any[]>([]);

  const { address, isConnected, chainId } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
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
    { address: engineAddress, abi: LAWPComplianceEngineABI as any, functionName: 'calculateProportionalYield', args: [id] }
  ]);

  const { data: batchData } = useReadContracts({ 
    contracts: batchContracts,
    query: {
      enabled: isConnected && !!address
    }
  });

  // Fetch real on-chain totalRaised for each pool
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
    }
  }, [isConfirmed, refetchPoolData]);

  const portfolio = tokenIdsToQuery.map((tokenIdBigInt, index) => {
    const baseIdx = index * 3;
    const ownerRes = batchData?.[baseIdx];
    
    // Only show tokens owned by connected address
    if (ownerRes?.status !== 'success' || ownerRes.result !== address) return null;

    const tDataRes = batchData?.[baseIdx + 1];
    const yDataRes = batchData?.[baseIdx + 2];

    if (tDataRes?.status !== 'success') return null;
    const tokenData: any = tDataRes.result;

    const pendingYield = yDataRes?.status === 'success' ? Number(yDataRes.result) / 1e18 : 0;
    const sharePercentage = (Number(tokenData.poolShareWAD) / 1e18) * 100;
    const pendingRoC = 0; // Simplified
    
    const pool = pools.find(p => parseInt(p.id) === Number(tokenData.poolId));

    return {
      tokenId: Number(tokenIdBigInt),
      poolName: pool ? pool.name : `Pool #${tokenData.poolId}`,
      sharePercentage: sharePercentage.toFixed(2) + '%',
      pendingYield: pendingYield.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      pendingRoC: pendingRoC.toLocaleString(undefined, { minimumFractionDigits: 2 }),
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

  const handleApprove = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: mockTokenAddress,
      abi: MockCNGNABI as any,
      functionName: 'approve',
      args: [contributionPoolAddress, BigInt(1000000) * BigInt(1e6)],
    }, {
      onSuccess: () => setSuccessMsg("Approval transaction sent! You can contribute once confirmed."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to approve")
    });
  };

  const handleContribute = (poolId: string, poolName: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: contributionPoolAddress,
      abi: LAWPContributionPoolABI as any,
      functionName: 'contribute',
      args: [BigInt(poolId), BigInt(1000) * BigInt(1e6)], // 1000 cNGN
    }, {
      onSuccess: () => setSuccessMsg(`Contribution to ${poolName} (Pool #${poolId}) sent! Waiting for confirmation...`),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || `Failed to contribute to ${poolName}`)
    });
  };

  const handleClaimYield = (tokenId: number) => {
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'claimYield',
      args: [BigInt(tokenId)],
    });
  };

  const handleClaimRoC = (tokenId: number) => {
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'claimRoC',
      args: [BigInt(tokenId)],
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Investor Portal</h2>
          <p className="text-[var(--color-brand-text-muted)] mt-2">Discover pools and manage your Impact Tokens.</p>
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
          <strong>Success:</strong> {successMsg} {isConfirmed && "(Transaction Confirmed!)"}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Active Pools">
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {!mounted || pools.length === 0 ? (
               <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                 No active pools.
               </div>
            ) : (
             pools.map((pool, index) => {
               // Fetch real totalRaised from on-chain data
               let raised = 0;
               if (poolData && poolData[index] && poolData[index].status === 'success') {
                 const res = poolData[index].result as any;
                 // res is PoolConfig struct, so res.totalRaised is the BigInt
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
                    <div className="flex gap-2 mt-2">
                      <Button 
                        variant="ghost" 
                        onClick={handleApprove}
                        disabled={isPending || isWaiting}
                        className="border border-white/10"
                      >
                        1. Approve cNGN
                      </Button>
                      <Button 
                        fullWidth 
                        onClick={() => handleContribute(pool.id, pool.name)}
                        disabled={isPending || isWaiting}
                      >
                        2. Contribute 1,000 cNGN
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
                        <span className="text-[var(--color-brand-text-muted)]">Pending Yield:</span>
                        <span className="text-right text-[var(--color-brand-success)] font-mono">{token.pendingYield} cNGN</span>
                        
                        <span className="text-[var(--color-brand-text-muted)]">Pending RoC:</span>
                        <span className="text-right text-[var(--color-brand-success)] font-mono">{token.pendingRoC} cNGN</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button 
                          fullWidth 
                          variant="secondary" 
                          disabled={token.pendingYield === '0.00' || isPending || isWaiting}
                          onClick={() => handleClaimYield(token.tokenId)}
                        >
                          {isPending ? 'Confirming...' : 'Claim Yield'}
                        </Button>
                        <Button 
                          fullWidth 
                          variant="ghost" 
                          disabled={token.pendingRoC === '0.00' || isPending || isWaiting} 
                          className="border border-white/10"
                          onClick={() => handleClaimRoC(token.tokenId)}
                        >
                          Claim RoC
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
