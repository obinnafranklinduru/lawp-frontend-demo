'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { LAWPComplianceEngineABI, LAWPContributionPoolABI } from '../config/abis';
import { getContractAddress } from '../config/contracts';

export default function AdminPortal() {
  const { chainId } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isWaiting, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  const engineAddress = getContractAddress(chainId, 'LAWPComplianceEngine') as `0x${string}`;
  const contributionPoolAddress = getContractAddress(chainId, 'LAWPContributionPool') as `0x${string}`;

  // Read nextPoolId directly from the contract
  const { data: nextPoolIdData, refetch: refetchNextPoolId } = useReadContract({
    address: contributionPoolAddress,
    abi: LAWPContributionPoolABI as any,
    functionName: 'nextPoolId',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [pendingDbSave, setPendingDbSave] = useState<any>(null);
  const [pendingSettlePoolId, setPendingSettlePoolId] = useState<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [pools, setPools] = useState<any[]>([]);

  // Form state
  const [newPool, setNewPool] = useState({ id: '', goal: '', name: '', startTime: '', endTime: '' });

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

  const openPools = pools.filter(p => p.status === 'Open');

  // Wait for transaction to be confirmed on-chain before saving to SQLite
  useEffect(() => {
    if (isConfirmed && pendingDbSave) {
      const savePool = async () => {
        try {
          // Refetch to get the latest nextPoolId after the transaction mined
          const { data: latestNextId } = await refetchNextPoolId();
          
          // If latestNextId is 5, it means the pool we just created is 4!
          const assignedPoolId = latestNextId ? Number(latestNextId) - 1 : pendingDbSave.id;

          const res = await fetch('/api/pools', {
            method: 'POST',
            body: JSON.stringify({
              ...pendingDbSave,
              id: assignedPoolId
            })
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to save to database");
          }
          setNewPool({ id: '', goal: '', name: '', startTime: '', endTime: '' });
          fetchPools();
          setSuccessMsg(`Pool created on-chain (Assigned ID: #${assignedPoolId}) and saved successfully!`);
          setPendingDbSave(null);
        } catch (dbErr: any) {
          setErrorMsg("Contract succeeded, but DB save failed: " + dbErr.message);
          setPendingDbSave(null);
        }
      };
      savePool();
    } else if (isConfirmed && pendingSettlePoolId !== null) {
      const updatePoolStatus = async () => {
         try {
           const res = await fetch('/api/pools', {
             method: 'PUT',
             body: JSON.stringify({ id: pendingSettlePoolId, status: 'Settled' })
           });
           if (!res.ok) {
             const data = await res.json();
             throw new Error(data.error || "Failed to update status in DB");
           }
           fetchPools();
           setSuccessMsg(`Pool #${pendingSettlePoolId} settled successfully!`);
           setPendingSettlePoolId(null);
         } catch (dbErr: any) {
           setErrorMsg("Contract succeeded, but DB update failed: " + dbErr.message);
           setPendingSettlePoolId(null);
         }
      };
      updatePoolStatus();
    }

    if (receiptError) {
      setErrorMsg("Transaction failed on-chain: " + receiptError.message);
      setPendingDbSave(null);
      setPendingSettlePoolId(null);
    }
  }, [isConfirmed, receiptError, pendingDbSave, pendingSettlePoolId, refetchNextPoolId]);

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const startTimeSecs = Math.floor(new Date(newPool.startTime).getTime() / 1000) - 86400; // -1 day for local anvil testing
      const endTimeSecs = Math.floor(new Date(newPool.endTime).getTime() / 1000);
      const goal6Decimals = BigInt(Math.floor(parseFloat(newPool.goal) * 1e6));
      
      writeContract({
        address: contributionPoolAddress,
        abi: LAWPContributionPoolABI as any,
        functionName: 'createPool',
        args: [
          BigInt(newPool.id),
          goal6Decimals,
          BigInt(startTimeSecs),
          BigInt(endTimeSecs)
        ]
      }, {
        onSuccess: () => {
          // Store the payload so we can save it to SQLite once the transaction is actually MINED.
          setPendingDbSave({
            id: parseInt(newPool.id),
            name: newPool.name,
            goal: newPool.goal,
            startTime: new Date(newPool.startTime).getTime(),
            endTime: new Date(newPool.endTime).getTime()
          });
          setSuccessMsg("Create Pool transaction sent... waiting for confirmation.");
        },
        onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to create pool")
      });
    } catch (error: any) {
      setErrorMsg(error.message);
    }
  };

  const handleEmergencyPause = () => {
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'pause', // Standard OpenZeppelin Pausable function
    });
  };

  const handleSettlePool = (poolId: number) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: contributionPoolAddress,
      abi: LAWPContributionPoolABI as any,
      functionName: 'settle', 
      args: [BigInt(poolId)],
    }, {
      onSuccess: () => {
        setPendingSettlePoolId(poolId);
        setSuccessMsg(`Settle transaction for Pool #${poolId} sent... waiting for confirmation.`);
      },
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to settle pool")
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold">Protocol Admin Panel</h2>
        <p className="text-[var(--color-brand-text-muted)] mt-2">Manage pools and monitor platform metrics.</p>
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
        <Card title="Deploy New Pool">
          <form className="space-y-4" onSubmit={handleCreatePool}>
            <div>
              <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Engine Pool ID</label>
              <input type="number" required value={newPool.id} onChange={e => setNewPool({...newPool, id: e.target.value})} placeholder="e.g. 1" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-3 text-white placeholder-gray-500 outline-none focus:border-[var(--color-brand-primary)] transition" />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Pool Name</label>
              <input type="text" required value={newPool.name} onChange={e => setNewPool({...newPool, name: e.target.value})} placeholder="e.g. Solar Array Alpha" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-3 text-white placeholder-gray-500 outline-none focus:border-[var(--color-brand-primary)] transition" />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Target Goal (cNGN)</label>
              <input type="number" required value={newPool.goal} onChange={e => setNewPool({...newPool, goal: e.target.value})} placeholder="e.g. 100000" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-3 text-white placeholder-gray-500 outline-none focus:border-[var(--color-brand-primary)] transition" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Start Time</label>
                <input type="datetime-local" required value={newPool.startTime} onChange={e => setNewPool({...newPool, startTime: e.target.value})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-3 text-white outline-none focus:border-[var(--color-brand-primary)] transition [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">End Time</label>
                <input type="datetime-local" required value={newPool.endTime} onChange={e => setNewPool({...newPool, endTime: e.target.value})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-3 text-white outline-none focus:border-[var(--color-brand-primary)] transition [color-scheme:dark]" />
              </div>
            </div>
            <Button fullWidth className="mt-4" type="submit">Create Pool</Button>
          </form>
        </Card>

        <Card title="Settle Pools (Goal Reached)">
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
             {!mounted || openPools.length === 0 ? (
               <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                 No pools active.
               </div>
             ) : (
               openPools.map((pool) => (
                 <div key={pool.id} className="p-4 border border-[var(--color-brand-border)] rounded-lg bg-white/5 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">Pool #{pool.id} ({pool.name})</span>
                      <span className="text-[var(--color-brand-success)] text-sm bg-[var(--color-brand-success)]/10 px-2 py-1 rounded">Open</span>
                    </div>
                    <div className="flex justify-between text-sm text-[var(--color-brand-text-muted)] border-t border-white/10 pt-2">
                      <span>Goal: {pool.goal.toLocaleString()} cNGN</span>
                    </div>
                    <Button 
                      fullWidth 
                      variant="secondary" 
                      className="mt-2"
                      disabled={isPending || isWaiting}
                      onClick={() => handleSettlePool(pool.id)}
                    >
                      {isPending ? 'Confirming...' : 'Settle & Mint NFTs'}
                    </Button>
                 </div>
               ))
             )}
          </div>
        </Card>
        
        <Card title="Emergency Controls" variant="danger" className="lg:col-span-2">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-[var(--color-brand-text-muted)] text-sm md:text-base">
              Triggering the emergency pause will immediately halt all yield claims, RoC claims, and pool contributions. Only use this if a critical vulnerability is detected.
            </p>
            <Button 
              variant="danger" 
              className="whitespace-nowrap"
              disabled={isPending || isWaiting}
              onClick={handleEmergencyPause}
            >
              {isPending ? 'Confirming...' : 'Trigger Emergency Pause'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
