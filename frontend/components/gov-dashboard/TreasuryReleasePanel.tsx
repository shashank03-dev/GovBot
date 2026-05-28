import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ExternalLink, Landmark, ShieldCheck, Wallet2 } from 'lucide-react';

import { fetchOfficialJson } from '@/lib/officialApi';
import {
  buildReleaseReference,
  buildReleaseTransactionRequest,
  extractWalletErrorMessage,
  isApprovedTreasuryWallet,
  resolveTreasuryNetworkConfig,
} from '@/lib/treasuryRelease.mjs';

type TreasuryWalletConfig = {
  chain_id: number;
  network_name: string;
  approved_wallet_address: string;
  release_anchor_address: string;
  explorer_base_url: string;
};

type SchemeSummary = {
  scheme: string;
  label: string;
  sanctioned_amount_inr: number;
  released_amount_inr: number;
  available_amount_inr: number;
  pending_beneficiary_count: number;
  ready_beneficiary_count: number;
  blocked_beneficiary_count: number;
  pending_release_amount_inr: number;
  latest_sanction_tx_hash?: string | null;
  latest_sanction_explorer_url?: string | null;
  latest_release_tx_hash?: string | null;
  latest_release_explorer_url?: string | null;
};

type ReleaseRow = {
  release_id: string;
  scheme: string;
  amount_inr: number;
  beneficiary_count: number;
  ready_count: number;
  blocked_count: number;
  tx_hash: string;
  released_at: string;
  explorer_url?: string | null;
};

type TreasurySummary = {
  official: {
    username: string;
  };
  wallet: TreasuryWalletConfig;
  schemes: SchemeSummary[];
  recent_releases: ReleaseRow[];
};

type EthereumRequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

type EthereumProvider = {
  request(args: EthereumRequestArgs): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const RELEASE_MEMO_GAS_HEX = '0x186A0';
const RELEASE_FALLBACK_GAS_HEX = '0x5208';

function toChainHex(chainId: number) {
  return `0x${Number(chainId || 0).toString(16)}`;
}

function encodeTextToHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function ensureTreasuryNetwork(wallet: EthereumProvider, chainId: number, networkName: string) {
  const chainHex = toChainHex(chainId);
  const networkConfig = resolveTreasuryNetworkConfig(chainId, networkName);
  try {
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainHex }],
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? Number((error as { code?: unknown }).code) : 0;
    if (code !== 4902) {
      throw error;
    }
    if (!networkConfig.rpcUrls.length || !networkConfig.blockExplorerUrls.length) {
      throw new Error(`Wallet does not recognize ${networkConfig.chainName} and no RPC configuration is available.`);
    }
    await wallet.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainHex,
          chainName: networkConfig.chainName,
          nativeCurrency: networkConfig.nativeCurrency,
          rpcUrls: networkConfig.rpcUrls,
          blockExplorerUrls: networkConfig.blockExplorerUrls,
        },
      ],
    });
  }
}

export default function TreasuryReleasePanel({ onReleased }: { onReleased?: () => Promise<void> | void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<TreasurySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedScheme, setSelectedScheme] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSummary = async () => {
      try {
        const payload = await fetchOfficialJson<TreasurySummary>(router, '/api/treasury/summary');
        if (!active) {
          return;
        }
        setSummary(payload);
        setSelectedScheme((current) => current || payload.schemes.find((item) => item.pending_beneficiary_count > 0)?.scheme || payload.schemes[0]?.scheme || '');
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load treasury release summary');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadSummary();
    return () => {
      active = false;
    };
  }, [router]);

  const selectedSummary = useMemo(
    () => summary?.schemes.find((item) => item.scheme === selectedScheme) || null,
    [selectedScheme, summary],
  );

  const walletMismatch = Boolean(
    walletAddress &&
      summary?.wallet.approved_wallet_address &&
      !isApprovedTreasuryWallet(walletAddress, summary.wallet.approved_wallet_address),
  );

  async function refreshSummary() {
    const payload = await fetchOfficialJson<TreasurySummary>(router, '/api/treasury/summary');
    setSummary(payload);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setError('No browser wallet detected. Open this page in a wallet-enabled browser.');
      return;
    }

    setWalletBusy(true);
    setError('');
    try {
      await ensureTreasuryNetwork(window.ethereum, summary?.wallet.chain_id || 80002, summary?.wallet.network_name || 'Polygon Amoy');
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      setWalletAddress(String(accounts?.[0] || '').trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect browser wallet');
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleRelease() {
    if (!summary || !selectedSummary) {
      return;
    }
    if (!window.ethereum) {
      setError('No browser wallet detected. Open this page in a wallet-enabled browser.');
      return;
    }
    if (!walletAddress) {
      setError('Connect the approved release wallet before authorizing funds.');
      return;
    }
    if (walletMismatch) {
      setError('The connected wallet does not match the whitelisted release wallet.');
      return;
    }
    if (!summary.wallet.release_anchor_address) {
      setError('Treasury release anchor address is not configured.');
      return;
    }

    setReleaseBusy(true);
    setError('');
    try {
      await ensureTreasuryNetwork(window.ethereum, summary.wallet.chain_id, summary.wallet.network_name);
      const releaseReference = buildReleaseReference({
        scheme: selectedSummary.scheme,
        amountInr: selectedSummary.pending_release_amount_inr,
        beneficiaryCount: selectedSummary.pending_beneficiary_count,
        officialUsername: summary.official.username,
        createdAt: new Date().toISOString(),
      });
      const memoRequest = buildReleaseTransactionRequest({
        from: walletAddress,
        to: summary.wallet.release_anchor_address,
        dataHex: encodeTextToHex(releaseReference),
        gasHex: RELEASE_MEMO_GAS_HEX,
      });

      let txHash = '';
      try {
        txHash = (await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [memoRequest],
        })) as string;
      } catch (walletError) {
        const walletMessage = extractWalletErrorMessage(walletError);
        const fallbackRequest = buildReleaseTransactionRequest({
          from: walletAddress,
          to: summary.wallet.release_anchor_address,
          gasHex: RELEASE_FALLBACK_GAS_HEX,
        });
        try {
          txHash = (await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [fallbackRequest],
          })) as string;
        } catch (fallbackError) {
          throw new Error(
            `${walletMessage} Fallback proof transfer also failed: ${extractWalletErrorMessage(
              fallbackError,
              'Could not submit a fallback proof transfer.',
            )}`,
          );
        }
      }

      await fetchOfficialJson(router, '/api/treasury/release', {
        method: 'POST',
        body: JSON.stringify({
          scheme: selectedSummary.scheme,
          tx_hash: txHash,
          wallet_address: walletAddress,
        }),
      });

      await refreshSummary();
      if (onReleased) {
        await onReleased();
      }
    } catch (err) {
      setError(extractWalletErrorMessage(err, 'Failed to authorize treasury release'));
    } finally {
      setReleaseBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="mb-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Loading treasury release console...</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Treasury Release Console
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Connect the approved department wallet, anchor the batch on the configured treasury test network, and publish a citizen-visible release record without exposing private beneficiary details.
          </p>
        </div>
        <Link
          href="/transparency"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00]"
        >
          Public transparency ledger
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(summary?.schemes || []).map((item) => {
              const selected = item.scheme === selectedScheme;
              return (
                <button
                  key={item.scheme}
                  type="button"
                  onClick={() => setSelectedScheme(item.scheme)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    selected ? 'border-orange-200 bg-orange-50 shadow-sm' : 'border-slate-100 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        ₹{Math.round(item.available_amount_inr).toLocaleString('en-IN')}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">Available sanctioned balance</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 text-[#e67e00]">
                      <Landmark className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Pending</div>
                      <div className="mt-1 font-semibold text-slate-900">{item.pending_beneficiary_count}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Ready</div>
                      <div className="mt-1 font-semibold text-teal-700">{item.ready_beneficiary_count}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Need bank verify</div>
                      <div className="mt-1 font-semibold text-[#e67e00]">{item.blocked_beneficiary_count}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSummary ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Release amount</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    ₹{Math.round(selectedSummary.pending_release_amount_inr).toLocaleString('en-IN')}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedSummary.ready_beneficiary_count} payout-ready beneficiaries, {selectedSummary.blocked_beneficiary_count} blocked by missing bank verification.
                  </p>
                </div>
                <div className="space-y-3">
                  {selectedSummary.latest_sanction_explorer_url ? (
                    <a
                      href={selectedSummary.latest_sanction_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 hover:border-slate-300"
                    >
                      <span>View sanction proof</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {selectedSummary.latest_release_explorer_url ? (
                    <a
                      href={selectedSummary.latest_release_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 hover:border-slate-300"
                    >
                      <span>View latest release proof</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-3 text-[#e67e00]">
              <Wallet2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Wallet gate</div>
              <div className="text-sm font-semibold text-slate-900">{summary?.wallet.network_name}</div>
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border border-white bg-white p-4">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Approved wallet</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-600">
                {summary?.wallet.approved_wallet_address || 'Not configured'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Connected wallet</div>
              <div className={`mt-1 break-all font-mono text-xs ${walletMismatch ? 'text-red-600' : 'text-slate-600'}`}>
                {walletAddress || 'Not connected'}
              </div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-slate-600">
              Release actions only work when the connected wallet matches the whitelisted department release address.
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={connectWallet}
              disabled={walletBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-[#e67e00] disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              {walletBusy ? 'Connecting wallet...' : walletAddress ? 'Reconnect wallet' : 'Connect wallet'}
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={
                releaseBusy ||
                !selectedSummary ||
                !walletAddress ||
                walletMismatch ||
                selectedSummary.pending_beneficiary_count === 0 ||
                selectedSummary.pending_release_amount_inr > selectedSummary.available_amount_inr
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff9933] to-[#e67e00] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-orange-200/50 transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {releaseBusy ? 'Authorizing release...' : 'Authorize release batch'}
            </button>
          </div>

          {(summary?.recent_releases || []).length > 0 ? (
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recent on-chain releases</div>
              <div className="mt-3 space-y-3">
                {summary?.recent_releases.slice(0, 3).map((item) => (
                  <a
                    key={item.release_id}
                    href={item.explorer_url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-white bg-white px-4 py-3 text-sm text-slate-600 hover:border-slate-200"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{item.scheme.toUpperCase()}</span>
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1">₹{Math.round(item.amount_inr).toLocaleString('en-IN')} for {item.beneficiary_count} beneficiaries</div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
