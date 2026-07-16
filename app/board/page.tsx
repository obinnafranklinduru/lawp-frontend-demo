'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSignTypedData, useReadContract, usePublicClient } from 'wagmi';
import { LAWPMultiSigControllerABI, MockCNGNABI, LAWPComplianceEngineABI } from '../config/abis';
import { getContractAddress } from '../config/contracts';

export default function BoardPortal() {
  const publicClient = usePublicClient();
  const { chainId, address } = useAccount();
  const { signTypedData, isPending: isSigning } = useSignTypedData();
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isWaiting } = useWaitForTransactionReceipt({ hash: txHash });

  const multiSigAddress = getContractAddress(chainId, 'LAWPMultiSigController');
  const engineAddress = getContractAddress(chainId, 'LAWPComplianceEngine');
  const cNGNTokenAddress = getContractAddress(chainId, 'MockCNGN');

  const { data: isUserSigner } = useReadContract({
    address: multiSigAddress as any,
    abi: LAWPMultiSigControllerABI,
    functionName: 'isSigner',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const [mounted, setMounted] = useState(false);
  const [payloads, setPayloads] = useState<any[]>([]);
  const [newPayload, setNewPayload] = useState({ poolId: '', amount: '', type: '1', required: 3, deadlineHrs: 24 });
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: remainingRocCapacityData } = useReadContract({
    address: engineAddress as any,
    abi: LAWPComplianceEngineABI,
    functionName: 'getRemainingRocCapacity',
    args: newPayload.poolId ? [BigInt(newPayload.poolId)] : undefined,
    query: { enabled: !!newPayload.poolId && newPayload.type === '0' }
  });
  
  const remainingRoc = remainingRocCapacityData ? Number(remainingRocCapacityData) / 1e6 : null;

  const fetchPayloads = async () => {
    try {
      const res = await fetch('/api/payloads');
      if (res.ok) setPayloads(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchPayloads();
    // Poll for updates
    const interval = setInterval(fetchPayloads, 5000);
    return () => clearInterval(interval);
  }, []);

  const pendingPayloads = payloads.filter(p => p.status === 'PENDING');
  const readyExecutions = payloads.filter(p => p.status === 'READY' || p.status === 'EXECUTED' || p.status === 'FAILED');

  const FLOW_TYPES: Record<string, string> = {
    '0': 'RoC',
    '1': 'GRANT_INITIAL',
    '2': 'GRANT_CONTINUOUS'
  };

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/payloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: parseInt(newPayload.poolId),
          amount: newPayload.amount, 
          type: newPayload.type,
          required: parseInt(newPayload.required as any),
          deadline: Math.floor(Date.now() / 1000) + (newPayload.deadlineHrs * 3600)
        })
      });
      if (!res.ok) throw new Error("Failed to propose");
      setSuccessMsg("Payload proposed successfully!");
      setNewPayload({ poolId: '', amount: '', type: '1', required: 3, deadlineHrs: 24 });
      fetchPayloads();
    } catch(e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleSignPayload = async (payload: any) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    
    if (!isUserSigner) {
      setErrorMsg("Unauthorized: Only verified board members can sign payloads.");
      return;
    }

    // EIP-712 Contract implementation
    signTypedData({
      domain: {
        name: 'LAWP MultiSig',
        version: '1',
        chainId: chainId,
        verifyingContract: multiSigAddress,
      },
      types: {
        Proposal: [
          { name: 'proposalId', type: 'uint256' },
          { name: 'poolId', type: 'uint256' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'flowType', type: 'uint8' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Proposal',
      message: {
        proposalId: BigInt(payload.id),
        poolId: BigInt(payload.poolId),
        totalAmount: BigInt(Math.floor(Number(payload.amount) * 1e6)),
        flowType: parseInt(payload.type),
        deadline: BigInt(payload.deadline),
      },
    }, {
        onSuccess: async (signature) => {
         try {
           await fetch('/api/signatures', {
             method: 'POST',
             body: JSON.stringify({
               payloadId: payload.id,
               signerAddress: address,
               signatureHash: signature
             }),
           });
           setSuccessMsg("Payload signed successfully!");
           fetchPayloads(); // Refresh payloads after signing
         } catch (e) {
           setErrorMsg("Failed to save signature");
         }
       },
       onError: (err: any) => setErrorMsg(err.shortMessage || err.message || "Signature request failed")
     });
   };
 
   const handleExecute = async (payload: any) => {
     try {
       setErrorMsg(null);
       setSuccessMsg("Fetching signatures...");
       const res = await fetch(`/api/signatures?payloadId=${payload.id}`);
       if (!res.ok) throw new Error("Failed to fetch signatures");
       const sigData = await res.json();
       
       // Sort signatures by signer address to match the smart contract requirement
       sigData.sort((a: any, b: any) => {
         return a.signerAddress.toLowerCase().localeCompare(b.signerAddress.toLowerCase());
       });

       // Concatenate into a single hex string for the bytes calldata argument
       let concatenatedSignatures = "0x";
       for (const sig of sigData) {
          concatenatedSignatures += sig.signatureHash.replace("0x", "");
       }

       if (!publicClient) throw new Error("Public client not found");

       const amountInWei = BigInt(Math.floor(Number(payload.amount) * 1e6));
       
       setSuccessMsg("Checking token balance...");
       const balance = await publicClient.readContract({
         address: cNGNTokenAddress as `0x${string}`,
         abi: MockCNGNABI,
         functionName: 'balanceOf',
         args: [address as `0x${string}`]
       }) as bigint;

       if (balance < amountInWei) {
         throw new Error(`Insufficient cNGN balance. You need ${Number(payload.amount).toLocaleString()} cNGN to execute this payload.`);
       }

       setSuccessMsg("Checking token approval...");
       const allowance = await publicClient.readContract({
         address: cNGNTokenAddress as `0x${string}`,
         abi: MockCNGNABI,
         functionName: 'allowance',
         args: [address as `0x${string}`, engineAddress]
       }) as bigint;

       if (allowance < amountInWei) {
         setSuccessMsg("Please approve the token spend limit in your wallet...");
         const approveHash = await writeContractAsync({
           address: cNGNTokenAddress as `0x${string}`,
           abi: MockCNGNABI as any,
           functionName: 'approve',
           args: [engineAddress, amountInWei]
         });
         setSuccessMsg("Waiting for approval confirmation...");
         await publicClient.waitForTransactionReceipt({ hash: approveHash });
       }

       setSuccessMsg("Please confirm the execution transaction...");
       const executeHash = await writeContractAsync({
         address: multiSigAddress,
         abi: LAWPMultiSigControllerABI as any,
         functionName: 'executeProposal', 
         args: [
           BigInt(payload.id),
           BigInt(payload.poolId),
           amountInWei,
           parseInt(payload.type),
           BigInt(payload.deadline),
           concatenatedSignatures
         ],
       });
       setSuccessMsg("Execution transaction submitted! Waiting for confirmation...");
       const receipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
       
       if (receipt.status === 'reverted') {
         await fetch('/api/payloads', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ id: payload.id, status: 'FAILED' })
         });
         fetchPayloads();
         throw new Error("Transaction reverted on-chain! Check principal caps or token balances.");
       }

       await fetch('/api/payloads', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ id: payload.id, status: 'EXECUTED' })
       });

       setSuccessMsg("Payload executed successfully!");
       fetchPayloads();
     } catch (e: any) {
       setErrorMsg(e.shortMessage || e.message || "Failed to execute payload");
       setSuccessMsg(null);
     }
   };

   useEffect(() => {
     if (isWaiting === false && txHash) {
       // Optional: could add logic to verify if it was a success or revert 
       // but for now relying on standard wagmi hook lifecycle
     }
   }, [isWaiting, txHash]);

   return (
     <div className="space-y-8 animate-in fade-in duration-500">
       <div>
         <h2 className="text-3xl font-bold">Operational Board Portal</h2>
         <p className="text-[var(--color-brand-text-muted)] mt-2">Review, sign, and relay EIP-712 payloads for revenue routing.</p>
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
        <h3 className="text-xl font-bold mb-4 text-[var(--color-brand-primary)]">Board Operations Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
           <div><strong className="text-white block mb-1">1. Propose Route</strong> Create an off-chain EIP-712 payload to route funds out of a specific pool.</div>
           <div><strong className="text-white block mb-1">2. Cryptographic Signatures</strong> Board members review and sign the payload using their wallets to meet the required signature threshold.</div>
           <div><strong className="text-white block mb-1">3. Broadcast Execution</strong> Any relayer with sufficient cNGN can execute the payload. The system will automatically bundle token approval and multi-sig execution into a seamless sequence.</div>
        </div>
      </div>

      <Card title="Propose Revenue Route">
        <form className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end" onSubmit={handlePropose}>
          <div>
            <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Pool ID</label>
            <input type="number" required value={newPayload.poolId} onChange={e => setNewPayload({...newPayload, poolId: e.target.value})} placeholder="e.g. 1" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">
              Amount (cNGN)
              {newPayload.type === '0' && remainingRoc !== null && (
                <span className="text-xs text-[var(--color-brand-success)] ml-2">(Max: {remainingRoc.toLocaleString()} cNGN)</span>
              )}
            </label>
            <input type="number" required value={newPayload.amount} onChange={e => setNewPayload({...newPayload, amount: e.target.value})} placeholder="e.g. 500" className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Flow Type</label>
            <select value={newPayload.type} onChange={e => setNewPayload({...newPayload, type: e.target.value})} className="w-full bg-[#111111] border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]">
              <option value="0">RoC (Return of Contribution)</option>
              <option value="1">GRANT_INITIAL (Activator Sale)</option>
              <option value="2">GRANT_CONTINUOUS (Refill)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Deadline (Hours)</label>
            <input type="number" required min="1" value={newPayload.deadlineHrs} onChange={e => setNewPayload({...newPayload, deadlineHrs: parseInt(e.target.value)})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-brand-text-muted)] mb-1">Req. Signatures</label>
            <input type="number" required min="1" max="5" value={newPayload.required} onChange={e => setNewPayload({...newPayload, required: parseInt(e.target.value)})} className="w-full bg-white/5 border border-[var(--color-brand-border)] rounded p-2 text-white outline-none focus:border-[var(--color-brand-primary)]" />
          </div>
          <Button type="submit">Propose</Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Pending Payloads (Require Signature)">
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {!mounted || pendingPayloads.length === 0 ? (
               <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                 No payloads pending signature.
               </div>
            ) : (
              pendingPayloads.map((payload) => (
               <div key={payload.id} className="p-4 border border-[var(--color-brand-border)] rounded-lg bg-white/5 flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="font-bold text-lg">Route Revenue</span>
                    <span className="text-xs bg-[var(--color-brand-warning)]/20 text-[var(--color-brand-warning)] px-2 py-1 rounded">
                      {payload.signatures}/{payload.required} Signatures
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div className="text-[var(--color-brand-text-muted)]">Pool ID:</div>
                    <div className="text-right font-mono">{payload.poolId}</div>
                    <div className="text-[var(--color-brand-text-muted)]">Amount:</div>
                    <div className="text-right font-mono text-[var(--color-brand-success)]">{payload.amount.toLocaleString()} cNGN</div>
                    <div className="text-[var(--color-brand-text-muted)]">Flow Type:</div>
                    <div className="text-right font-mono">{FLOW_TYPES[payload.type] || payload.type}</div>
                  </div>
                  <Button 
                    fullWidth 
                    className="mt-4"
                    disabled={isSigning || !isUserSigner}
                    onClick={() => handleSignPayload(payload)}
                  >
                    {isSigning ? 'Awaiting Signature...' : 'Sign Payload (EIP-712)'}
                  </Button>
               </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Execution Relay (Ready)" variant="highlight">
          <p className="text-sm text-[var(--color-brand-text-muted)] mb-4">
            Payloads that have reached the threshold can be executed by any relayer to trigger the on-chain transfer.
          </p>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {!mounted || readyExecutions.length === 0 ? (
               <div className="p-4 border border-[var(--color-brand-border)] rounded bg-white/5 text-center text-[var(--color-brand-text-muted)]">
                 No executions ready.
               </div>
            ) : (
              readyExecutions.map((payload) => (
               <div key={payload.id} className="p-4 border border-[var(--color-brand-primary)]/30 rounded-lg bg-[var(--color-brand-primary)]/5 flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="font-bold text-lg">Route Revenue</span>
                    <span className="text-xs bg-[var(--color-brand-success)]/20 text-[var(--color-brand-success)] px-2 py-1 rounded">
                      {payload.signatures}/{payload.required} Signatures
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div className="text-[var(--color-brand-text-muted)]">Pool ID:</div>
                    <div className="text-right font-mono">{payload.poolId}</div>
                    <div className="text-[var(--color-brand-text-muted)]">Amount:</div>
                    <div className="text-right font-mono text-[var(--color-brand-success)]">{payload.amount.toLocaleString()} cNGN</div>
                    <div className="text-[var(--color-brand-text-muted)]">Flow Type:</div>
                    <div className="text-right font-mono">{FLOW_TYPES[payload.type] || payload.type}</div>
                  </div>
                  <div className="flex flex-col mt-4">
                    {payload.status === 'EXECUTED' ? (
                      <Button fullWidth variant="ghost" disabled className="border border-[var(--color-brand-success)]/50 text-[var(--color-brand-success)]">
                        Executed
                      </Button>
                    ) : payload.status === 'FAILED' ? (
                      <Button fullWidth variant="ghost" disabled className="border border-red-500/50 text-red-500">
                        Failed
                      </Button>
                    ) : (
                      <Button fullWidth onClick={() => handleExecute(payload)} disabled={isPending || isWaiting}>
                        {isPending || isWaiting ? 'Processing...' : 'Broadcast'}
                      </Button>
                    )}
                  </div>
               </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
