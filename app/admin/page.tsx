'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts } from 'wagmi';
import { 
  LAWPComplianceEngineABI, 
  LAWPContributionPoolABI,
  LAWPActorRegistryABI,
  LAWPMultiSigControllerABI,
  MockCNGNABI
} from '../config/abis';
import { getContractAddress } from '../config/contracts';
import { Activity, Users, Wallet, ShieldAlert, BarChart3, Database, Shield } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';

export default function AdminPortal() {
  const { chainId, address } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isWaiting, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  const engineAddress = getContractAddress(chainId, 'LAWPComplianceEngine') as `0x${string}`;
  const contributionPoolAddress = getContractAddress(chainId, 'LAWPContributionPool') as `0x${string}`;
  const registryAddress = getContractAddress(chainId, 'LAWPActorRegistry') as `0x${string}`;
  const multiSigAddress = getContractAddress(chainId, 'LAWPMultiSigController') as `0x${string}`;
  const cngnAddress = getContractAddress(chainId, 'MockCNGN') as `0x${string}`;

  // Read nextPoolId directly from the contract
  const { data: nextPoolIdData, refetch: refetchNextPoolId } = useReadContract({
    address: contributionPoolAddress,
    abi: LAWPContributionPoolABI as any,
    functionName: 'nextPoolId',
  });

  const { data: isPausedData, refetch: refetchPausedState } = useReadContract({
    address: engineAddress as any,
    abi: LAWPComplianceEngineABI,
    functionName: 'paused'
  });
  const isPaused = Boolean(isPausedData);

  // Governance Reads - Wallets
  const { data: opWalletData, refetch: refetchOpWallet } = useReadContract({
    address: registryAddress as any,
    abi: LAWPActorRegistryABI,
    functionName: 'operationalTreasuryWallet'
  });

  const { data: la2WalletData, refetch: refetchLA2Wallet } = useReadContract({
    address: registryAddress as any,
    abi: LAWPActorRegistryABI,
    functionName: 'la2Wallet'
  });

  const { data: mvi1WalletData, refetch: refetchMVI1Wallet } = useReadContract({
    address: registryAddress as any,
    abi: LAWPActorRegistryABI,
    functionName: 'mvi1Wallet'
  });

  const { data: devWalletData, refetch: refetchDevWallet } = useReadContract({
    address: registryAddress as any,
    abi: LAWPActorRegistryABI,
    functionName: 'devWallet'
  });

  const { data: thresholdData, refetch: refetchThreshold } = useReadContract({
    address: multiSigAddress as any,
    abi: LAWPMultiSigControllerABI,
    functionName: 'threshold'
  });

  const { data: signerCountData, refetch: refetchSignerCount } = useReadContract({
    address: multiSigAddress as any,
    abi: LAWPMultiSigControllerABI,
    functionName: 'signerCount'
  });

  const { data: yieldVaultBalData } = useReadContract({
    address: cngnAddress as any,
    abi: MockCNGNABI,
    functionName: 'balanceOf',
    args: [getContractAddress(chainId, 'LAWPYieldVault')]
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [pendingDbSave, setPendingDbSave] = useState<any>(null);
  const [pendingSettlePoolId, setPendingSettlePoolId] = useState<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [pools, setPools] = useState<any[]>([]);
  const [payloads, setPayloads] = useState<any[]>([]);

  // Form states
  const [newPool, setNewPool] = useState({ id: '', goal: '', name: '', startTime: '', endTime: '' });
  const [govOpWallet, setGovOpWallet] = useState('');
  const [govLA2Wallet, setGovLA2Wallet] = useState('');
  const [govMVI1Wallet, setGovMVI1Wallet] = useState('');
  const [govDevWallet, setGovDevWallet] = useState('');
  const [govAddSigner, setGovAddSigner] = useState('');
  const [govRemoveSigner, setGovRemoveSigner] = useState('');
  const [govThreshold, setGovThreshold] = useState('');
  const [govMigrateFrom, setGovMigrateFrom] = useState('');
  const [govMigrateTo, setGovMigrateTo] = useState('');

  const fetchPools = async () => {
    try {
      const res = await fetch('/api/pools');
      if (res.ok) setPools(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPayloads = async () => {
    try {
      const res = await fetch('/api/payloads');
      if (res.ok) setPayloads(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const refetchAllData = () => {
    fetchPools();
    fetchPayloads();
    refetchNextPoolId();
    refetchOpWallet();
    refetchLA2Wallet();
    refetchMVI1Wallet();
    refetchDevWallet();
    refetchThreshold();
    refetchSignerCount();
  };

  useEffect(() => {
    setMounted(true);
    fetchPools();
    fetchPayloads();
    const interval = setInterval(() => {
      fetchPools();
      fetchPayloads();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const openPools = pools.filter(p => p.status === 'Open');

  // Refetch on-chain data when a transaction confirms
  useEffect(() => {
    if (isConfirmed) {
      refetchAllData();
      refetchPausedState();
    }
  }, [isConfirmed, refetchPausedState]);

  // Wait for transaction to be confirmed on-chain before saving to SQLite
  useEffect(() => {
    if (isConfirmed && pendingDbSave) {
      const savePool = async () => {
        try {
          const { data: latestNextId } = await refetchNextPoolId();
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
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'emergencyPause',
    }, {
      onSuccess: () => setSuccessMsg("Pause transaction sent... waiting for confirmation."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to pause protocol")
    });
  };

  const handleEmergencyUnpause = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'unpause',
    }, {
      onSuccess: () => setSuccessMsg("Unpause transaction sent... waiting for confirmation."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to unpause protocol")
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

  // Governance Actions
  const handleUpdateWallet = (e: React.FormEvent, functionName: 'setOperationalTreasuryWallet' | 'setLA2Wallet' | 'setMVI1Wallet' | 'setDevWallet', walletAddress: string) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: registryAddress as any,
      abi: LAWPActorRegistryABI,
      functionName,
      args: [walletAddress as `0x${string}`]
    }, {
      onSuccess: () => setSuccessMsg(`${functionName} transaction sent...`),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || `Failed to update ${functionName}`)
    });
  };

  const handleAddSigner = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: multiSigAddress as any,
      abi: LAWPMultiSigControllerABI,
      functionName: 'addSigner',
      args: [govAddSigner as `0x${string}`]
    }, {
      onSuccess: () => setSuccessMsg("Add signer transaction sent..."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to add signer")
    });
  };

  const handleRemoveSigner = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: multiSigAddress as any,
      abi: LAWPMultiSigControllerABI,
      functionName: 'removeSigner',
      args: [govRemoveSigner as `0x${string}`]
    }, {
      onSuccess: () => setSuccessMsg("Remove signer transaction sent..."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to remove signer")
    });
  };

  const handleMigrateBalance = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: engineAddress,
      abi: LAWPComplianceEngineABI,
      functionName: 'migrateOperationalBalance',
      args: [govMigrateFrom as `0x${string}`, govMigrateTo as `0x${string}`]
    }, {
      onSuccess: () => setSuccessMsg("Migrate balance transaction sent..."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to migrate balance")
    });
  };

  const handleUpdateThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    writeContract({
      address: multiSigAddress as any,
      abi: LAWPMultiSigControllerABI,
      functionName: 'updateThreshold',
      args: [BigInt(govThreshold)]
    }, {
      onSuccess: () => setSuccessMsg("Threshold update transaction sent..."),
      onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Failed to update threshold")
    });
  };

  // Compute Analytics
  const totalPoolGoal = pools.reduce((acc, p) => acc + Number(p.goal), 0);
  const totalPayloadRouted = payloads.filter(p => p.status === 'EXECUTED').reduce((acc, p) => acc + Number(p.amount), 0);
  
  // Format Payload Data for Recharts
  const chartData = payloads.slice(0, 10).reverse().map(p => ({
    name: `ID: ${p.id}`,
    amount: Number(p.amount),
    signatures: p.signatures
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="text-[var(--color-brand-primary)]" />
            Protocol Admin Dashboard
          </h2>
          <p className="text-[var(--color-brand-text-muted)] mt-2">Manage pools, configure governance, and monitor protocol analytics.</p>
        </div>
        {isPaused && (
          <div className="mt-4 md:mt-0 bg-red-500/20 text-red-400 px-4 py-2 rounded-full border border-red-500/50 flex items-center gap-2 font-mono text-sm shadow-[0_0_15px_rgba(255,0,0,0.3)]">
            <ShieldAlert size={16} /> SYSTEM PAUSED
          </div>
        )}
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

      {/* Analytics KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-[var(--color-brand-border)] p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)] rounded-lg">
            <Database size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--color-brand-text-muted)] uppercase tracking-wider">Total Pool Goals</p>
            <p className="text-2xl font-bold font-mono">{totalPoolGoal.toLocaleString()} <span className="text-sm">cNGN</span></p>
          </div>
        </div>
        <div className="bg-white/5 border border-[var(--color-brand-border)] p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-[var(--color-brand-success)]/10 text-[var(--color-brand-success)] rounded-lg">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--color-brand-text-muted)] uppercase tracking-wider">Total Grants Routed</p>
            <p className="text-2xl font-bold font-mono">{totalPayloadRouted.toLocaleString()} <span className="text-sm">cNGN</span></p>
          </div>
        </div>
        <div className="bg-white/5 border border-[var(--color-brand-border)] p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-[var(--color-brand-secondary)]/10 text-[var(--color-brand-secondary)] rounded-lg">
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--color-brand-text-muted)] uppercase tracking-wider">Yield Vault TVL</p>
            <p className="text-2xl font-bold font-mono">
              {yieldVaultBalData ? (Number(yieldVaultBalData) / 1e6).toLocaleString() : '0'} <span className="text-sm">cNGN</span>
            </p>
          </div>
        </div>
        <div className="bg-white/5 border border-[var(--color-brand-border)] p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--color-brand-text-muted)] uppercase tracking-wider">Active Board</p>
            <p className="text-2xl font-bold font-mono">
              {thresholdData?.toString() || '0'} / {signerCountData?.toString() || '0'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Pool Management */}
        <div className="lg:col-span-1 space-y-8">
          <Card title="Deploy New Pool">
            <form className="space-y-4" onSubmit={handleCreatePool}>
              <div>
                <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Engine Pool ID</label>
                <input type="number" required value={newPool.id} onChange={e => setNewPool({...newPool, id: e.target.value})} placeholder="e.g. 1" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Pool Name</label>
                <input type="text" required value={newPool.name} onChange={e => setNewPool({...newPool, name: e.target.value})} placeholder="e.g. Eziobodo Pool Unit 1" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Target Goal (cNGN)</label>
                <input type="number" required value={newPool.goal} onChange={e => setNewPool({...newPool, goal: e.target.value})} placeholder="e.g. 100000" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Start Time</label>
                  <input type="datetime-local" required value={newPool.startTime} onChange={e => setNewPool({...newPool, startTime: e.target.value})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)] [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">End Time</label>
                  <input type="datetime-local" required value={newPool.endTime} onChange={e => setNewPool({...newPool, endTime: e.target.value})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)] [color-scheme:dark]" />
                </div>
              </div>
              <Button fullWidth className="mt-2" type="submit">Create Pool</Button>
            </form>
          </Card>

          <Card title="Settle Pools (Goal Reached)">
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
               {!mounted || openPools.length === 0 ? (
                 <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                   No pools active.
                 </div>
               ) : (
                 openPools.map((pool) => (
                   <div key={pool.id} className="p-4 border border-[var(--color-brand-border)] rounded-lg bg-white/5 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold">Pool #{pool.id} ({pool.name})</span>
                      </div>
                      <div className="flex justify-between text-sm text-[var(--color-brand-text-muted)] border-t border-white/10 pt-2">
                        <span>Goal: {pool.goal.toLocaleString()} cNGN</span>
                      </div>
                      <Button 
                        fullWidth 
                        variant="secondary" 
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
        </div>

        {/* Right Column: Analytics & Governance */}
        <div className="lg:col-span-2 space-y-8">
          
          <Card title="Recent Revenue Routes (Payload Analytics)">
            <div className="h-64 w-full">
              {mounted && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#00F0FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" stroke="#8B949E" fontSize={12} />
                    <YAxis stroke="#8B949E" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0B0E14', borderColor: '#00F0FF', borderRadius: '8px' }}
                      itemStyle={{ color: '#00F0FF' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#00F0FF" fillOpacity={1} fill="url(#colorAmount)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--color-brand-text-muted)] border border-dashed border-white/10 rounded-lg bg-white/5">
                  Not enough payload history.
                </div>
              )}
            </div>
          </Card>

          <Card title="Protocol Wallets Configuration" variant="highlight">
            <div className="space-y-4">
              
              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-2 text-sm text-[var(--color-brand-text-muted)]">Operational Treasury Wallet (Receives 10% risk fee)</h4>
                <div className="flex items-center gap-2 text-xs text-white mb-2 font-mono break-all">
                  Current: {opWalletData ? opWalletData.toString() : 'Loading...'}
                </div>
                <form className="flex gap-2" onSubmit={(e) => handleUpdateWallet(e, 'setOperationalTreasuryWallet', govOpWallet)}>
                  <input type="text" required value={govOpWallet} onChange={e => setGovOpWallet(e.target.value)} placeholder="0x..." className="flex-1 bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  <Button type="submit" variant="secondary" className="text-sm px-4">Update</Button>
                </form>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-2 text-sm text-[var(--color-brand-text-muted)]">LA2 Wallet (50% GRANT_INITIAL | 55% GRANT_CONTINUOUS)</h4>
                <div className="flex items-center gap-2 text-xs text-white mb-2 font-mono break-all">
                  Current: {la2WalletData ? la2WalletData.toString() : 'Loading...'}
                </div>
                <form className="flex gap-2" onSubmit={(e) => handleUpdateWallet(e, 'setLA2Wallet', govLA2Wallet)}>
                  <input type="text" required value={govLA2Wallet} onChange={e => setGovLA2Wallet(e.target.value)} placeholder="0x..." className="flex-1 bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  <Button type="submit" variant="secondary" className="text-sm px-4">Update</Button>
                </form>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-2 text-sm text-[var(--color-brand-text-muted)]">MVI1 Wallet (20% GRANT_INITIAL | 25% GRANT_CONTINUOUS)</h4>
                <div className="flex items-center gap-2 text-xs text-white mb-2 font-mono break-all">
                  Current: {mvi1WalletData ? mvi1WalletData.toString() : 'Loading...'}
                </div>
                <form className="flex gap-2" onSubmit={(e) => handleUpdateWallet(e, 'setMVI1Wallet', govMVI1Wallet)}>
                  <input type="text" required value={govMVI1Wallet} onChange={e => setGovMVI1Wallet(e.target.value)} placeholder="0x..." className="flex-1 bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  <Button type="submit" variant="secondary" className="text-sm px-4">Update</Button>
                </form>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-2 text-sm text-[var(--color-brand-text-muted)]">Dev Wallet (10% GRANT_CONTINUOUS)</h4>
                <div className="flex items-center gap-2 text-xs text-white mb-2 font-mono break-all">
                  Current: {devWalletData ? devWalletData.toString() : 'Loading...'}
                </div>
                <form className="flex gap-2" onSubmit={(e) => handleUpdateWallet(e, 'setDevWallet', govDevWallet)}>
                  <input type="text" required value={govDevWallet} onChange={e => setGovDevWallet(e.target.value)} placeholder="0x..." className="flex-1 bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  <Button type="submit" variant="secondary" className="text-sm px-4">Update</Button>
                </form>
              </div>

            </div>
          </Card>

          <Card title="Vault Operations" variant="highlight">
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-4"><Activity size={16} /> Migrate Operational Balance</h4>
                <p className="text-xs text-[var(--color-brand-text-muted)] mb-4">
                  Moves the full cNGN token balance from one operational address to another.
                </p>
                <form className="space-y-4" onSubmit={handleMigrateBalance}>
                  <div>
                    <label className="block text-xs text-[var(--color-brand-text-muted)] mb-1">From Address</label>
                    <input type="text" required value={govMigrateFrom} onChange={e => setGovMigrateFrom(e.target.value)} placeholder="0x..." className="w-full bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-brand-text-muted)] mb-1">To Address</label>
                    <input type="text" required value={govMigrateTo} onChange={e => setGovMigrateTo(e.target.value)} placeholder="0x..." className="w-full bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  </div>
                  <Button fullWidth type="submit" variant="secondary" className="text-sm">Migrate Balance</Button>
                </form>
              </div>
            </div>
          </Card>

          <Card title="Multi-Sig Board Configuration" variant="highlight">
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-4"><Users size={16} /> Manage Board Members</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <form className="space-y-2" onSubmit={handleAddSigner}>
                    <input type="text" required value={govAddSigner} onChange={e => setGovAddSigner(e.target.value)} placeholder="Add Address (0x...)" className="w-full bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-success)]" />
                    <Button fullWidth type="submit" variant="secondary" className="text-sm border-[var(--color-brand-success)]/30 text-[var(--color-brand-success)] hover:bg-[var(--color-brand-success)]/10">Add Signer</Button>
                  </form>
                  <form className="space-y-2" onSubmit={handleRemoveSigner}>
                    <input type="text" required value={govRemoveSigner} onChange={e => setGovRemoveSigner(e.target.value)} placeholder="Remove Address (0x...)" className="w-full bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-red-500" />
                    <Button fullWidth type="submit" variant="secondary" className="text-sm border-red-500/30 text-red-500 hover:bg-red-500/10">Remove Signer</Button>
                  </form>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-[var(--color-brand-border)]">
                <h4 className="font-bold flex items-center gap-2 mb-4"><Shield size={16} /> Update Board Approval Threshold</h4>
                <form className="flex gap-2" onSubmit={handleUpdateThreshold}>
                  <input type="number" required min="1" max={signerCountData ? Number(signerCountData) : 1} value={govThreshold} onChange={e => setGovThreshold(e.target.value)} placeholder={`e.g. 3 (Max: ${signerCountData || 0})`} className="flex-1 bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-sm text-white outline-none focus:border-[var(--color-brand-primary)]" />
                  <Button type="submit" variant="secondary" className="text-sm px-4">Update Threshold</Button>
                </form>
              </div>
            </div>
          </Card>

          <Card title="Emergency Controls" variant="danger">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <p className="text-[var(--color-brand-text-muted)] text-sm">
                {isPaused 
                  ? "The protocol is currently PAUSED. Contributions, claims, and settlements are disabled. You can resume operations by unpausing."
                  : "Triggering the emergency pause will immediately halt all yield claims, RoC claims, and pool contributions. Only use this if a critical vulnerability is detected."
                }
              </p>
              <Button 
                variant={isPaused ? "secondary" : "danger"} 
                className={isPaused ? "whitespace-nowrap shadow-[0_0_15px_var(--color-brand-success)] text-[var(--color-brand-success)] border-[var(--color-brand-success)]" : "whitespace-nowrap"}
                disabled={isPending || isWaiting}
                onClick={isPaused ? handleEmergencyUnpause : handleEmergencyPause}
              >
                {isPending ? 'Confirming...' : (isPaused ? 'Unpause Protocol' : 'Trigger Emergency Pause')}
              </Button>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
