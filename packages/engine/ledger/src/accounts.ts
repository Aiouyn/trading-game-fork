// 03 §3.2 chart of accounts, the account-key codec and the authored system entity ids (T03-01).
// E-79: this flat file (`src/accounts.ts`) owns what the card splits over `rules/chart.ts`, `rules/accountKey.ts` and
// `rules/ids.ts`. The account-key codec and the ids already lived here; this card adds the chart on top of them.
import { isCcy, type Ccy, type Id } from './money';
import { SortedMap } from './det';
import type { BlocCode, EntityKind } from './types';

export type AccountClass = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
export const SYS_ID = 'sys_SYSTEM';
export const cbkId = (ccy: Ccy): Id => `cbk_${ccy}`;
/** 03 §3.12.8: the FDL treasury collects for the free zone (Isla Serena). */
export const SERENA_AUTHORITY_GOV: Id = 'gov_FDL';

/** Pure memo of kindOfId (ids are immutable strings); holds no world state. */
const KIND: Record<string, EntityKind | null> = Object.create(null);
export function kindOfId(id: Id): EntityKind | undefined {
  const hit = KIND[id];
  if (hit !== undefined) return hit ?? undefined;
  const r = kindUncached(id); KIND[id] = r ?? null; return r;
}
function kindUncached(id: Id): EntityKind | undefined {
  const k = id.split('_')[0];
  return (['sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr'] as const)
    .find((x) => x === k);
}

// ───────── authored system entity ids (03 §2.1, 22 content catalogs) ─────────
/** The one system entity (elastic advances, issuance owed, interpartition suspense). */
export const SYS_SYSTEM_ID = SYS_ID;
/** One treasury per bloc. */
export const govId = (bloc: BlocCode): Id => `gov_${bloc}`;
/** One firm sector per bloc. */
export const frmId = (bloc: BlocCode): Id => `frm_${bloc}`;
/** One household sector per city. */
export const hhId = (cityId: string): Id => `hh_${cityId}`;
/** The rest-of-world elastic sector. */
export const ROW_ID: Id = 'row_WORLD';
/** The Clearing House (one). */
export const CCP_ID: Id = 'ccp_TCH';
/** The interpartition suspense sub (03 §3.2 code 9900): `${A}->${B}`. */
export const suspenseSub = (fromPartition: string, toPartition: string): string => `${fromPartition}->${toPartition}`;

// ───────── the account-key codec (03 §2.2) ─────────
/** '<entityId>:<code>[:<sub>]:<ccy>'; the sub may itself contain ':' (e.g. RESTRICTED:51840:AD_GRANT). */
export function accountKey(entityId: Id, code: number, ccy: Ccy, sub?: string): string {
  const c = String(code).padStart(4, '0');
  return sub === undefined ? `${entityId}:${c}:${ccy}` : `${entityId}:${c}:${sub}:${ccy}`;
}
export interface ParsedKey { entityId: Id; code: number; sub?: string; ccy: Ccy }
/** Pure memo of parseAccountKey (keys are immutable strings); holds no world state. */
const PARSED: Record<string, ParsedKey | null> = Object.create(null);
export function parseAccountKey(key: string): ParsedKey | undefined {
  const hit = PARSED[key];
  if (hit !== undefined) return hit ?? undefined;
  const r = parseUncached(key);
  PARSED[key] = r ?? null;
  return r;
}
function parseUncached(key: string): ParsedKey | undefined {
  const parts = key.split(':');
  if (parts.length < 3) return undefined;
  const ccy = parts[parts.length - 1];
  const code = Number(parts[1]);
  if (!isCcy(ccy) || !/^\d{4}$/.test(parts[1]) || parts[0] === '' || kindOfId(parts[0]) === undefined) return undefined;
  const sub = parts.length > 3 ? parts.slice(2, -1).join(':') : undefined;
  return { entityId: parts[0], code, sub, ccy };
}
export const entityOfKey = (key: string): Id => key.split(':')[0];

// ───────── the chart of accounts (03 §3.2, complete) ─────────
/**
 * One row of the chart. `subMeaning` is the spec's Sub column (null when the code has no sub-key).
 * `kinds` is 'ALL' or the entity kinds the code is restricted to (03 §2.1 template + the Notes column).
 */
export interface ChartEntry {
  code: number; name: string; cls: AccountClass; subMeaning: string | null; isMoney: boolean;
  kinds: readonly EntityKind[] | 'ALL'; qtyBearing: boolean; contra: boolean; mustBeZeroAtP13: boolean; consolidatedOnly: boolean;
}
/** How a code holds money: every kind, only the elastic sectors (virtual money), or not money at all. */
type MoneyFlag = 'ALL' | 'ELASTIC' | 'NO';

const ELASTIC_KINDS: readonly EntityKind[] = ['hh', 'frm', 'row'];
const isElasticKind = (k: EntityKind): boolean => k === 'hh' || k === 'frm' || k === 'row';

/**
 * The chart, row by row (03 §3.2, every row of the 1xxx/2xxx/3xxx tables, every 4xxx/5xxx/6xxx code of the income,
 * expense and income-tax lists, and the 9xxx memo list).
 * Flags: `q` qty-bearing, `C` contra, `Z` must be zero at P13, `X` consolidated statements only.
 */
type ChartRow = readonly [code: number, name: string, sub: string | null, kinds: readonly EntityKind[] | 'ALL', money: MoneyFlag, flags: string];

const CHART_ROWS: readonly ChartRow[] = [
  // ── 1xxx assets ──
  [1001, 'Settlement cash', null, 'ALL', 'ALL', ''],
  [1002, 'Reserves at central bank', null, 'ALL', 'ALL', ''],
  [1003, 'Treasury account at central bank', 'sub-accounts: GENERAL, DEPOSIT_INSURANCE_FUND', ['gov'], 'ALL', ''],
  [1009, 'Elastic money (virtual)', null, ELASTIC_KINDS, 'ELASTIC', ''],
  [1010, 'Deposits at bank', 'bnkId (term deposits: bnkId:termId)', 'ALL', 'ALL', ''],
  [1050, 'Margin posted', 'ccpId or prime-broker bnkId', 'ALL', 'NO', ''],
  [1060, 'Default-fund contribution', 'ccpId', 'ALL', 'NO', ''],
  [1070, 'Escrow deposited', 'contractId or caseId', 'ALL', 'NO', ''],
  [1100, 'Trade receivables', 'counterpartyId', 'ALL', 'NO', ''],
  [1110, 'Interest receivable', 'instrument or loanId', 'ALL', 'NO', ''],
  [1120, 'Dividends receivable', 'assetId', 'ALL', 'NO', ''],
  [1130, 'Tax receivable (refunds)', 'jurisdiction:taxType', 'ALL', 'NO', ''],
  [1140, 'Insurance and reinsurance recoverables', 'policyId', 'ALL', 'NO', ''],
  [1150, 'Due from related parties', 'entityId', 'ALL', 'NO', ''],
  [1160, 'Judgments and restitution receivable', 'caseId', 'ALL', 'NO', ''],
  [1190, 'Other receivables', 'ref', 'ALL', 'NO', ''],
  [1200, 'Inventory (goods)', 'sku', 'ALL', 'NO', 'q'],
  [1210, 'Physical commodities', 'commodityId (qty)', 'ALL', 'NO', 'q'],
  [1220, 'Compute balance', "'OWNED' / 'RESERVED' (qty in PFLOP-day×1000)", 'ALL', 'NO', 'q'],
  [1221, 'Restricted compute (hijack loot)', 'sessionId (qty)', 'ALL', 'NO', 'q'],
  [1230, 'Prepaid expenses', 'ref', 'ALL', 'NO', ''],
  [1300, 'Loans receivable', 'loanId', 'ALL', 'NO', ''],
  [1301, 'Mortgages receivable', 'loanId', 'ALL', 'NO', ''],
  [1302, 'Margin loans receivable', 'accountId', 'ALL', 'NO', ''],
  [1303, 'Credit lines drawn', 'lineId', 'ALL', 'NO', ''],
  [1304, 'Interbank loans', 'loanId', 'ALL', 'NO', ''],
  [1305, 'Reverse repo (cash lent)', 'repoId', 'ALL', 'NO', ''],
  [1306, 'P2P loans receivable', 'contractId', 'ALL', 'NO', ''],
  [1307, 'Central-bank lending to banks', 'facilityId', ['cbk'], 'NO', ''],
  [1309, 'Allowance for credit losses (contra-asset)', 'portfolioId', 'ALL', 'NO', 'qC'],
  [1500, 'Listed equities', 'assetId (qty)', 'ALL', 'NO', 'q'],
  [1510, 'ETFs', 'assetId (qty)', 'ALL', 'NO', 'q'],
  [1520, 'Bonds', 'assetId (face qty)', 'ALL', 'NO', 'q'],
  [1530, 'Fund units', 'fndId (qty)', 'ALL', 'NO', 'q'],
  [1540, 'Crypto tokens', 'tokenId (qty)', 'ALL', 'NO', 'q'],
  [1541, 'DeFi liquidity positions', 'poolId (qty LP tokens)', 'ALL', 'NO', 'q'],
  [1542, 'DeFi lending deposits', 'protocolId:tokenId (qty)', 'ALL', 'NO', 'q'],
  [1560, 'Structured tranches', 'trancheId (qty)', 'ALL', 'NO', 'q'],
  [1570, 'Private equity and venture stakes', 'cmpId:shareClass (qty)', 'ALL', 'NO', 'q'],
  [1580, 'Investments in controlled entities', 'entityId', 'ALL', 'NO', 'q'],
  [1600, 'Derivative assets', 'positionId', 'ALL', 'NO', 'q'],
  [1700, 'AI models', 'modelId', 'ALL', 'NO', 'q'],
  [1710, 'Datasets', 'datasetId', 'ALL', 'NO', 'q'],
  [1720, 'Purchased licenses (model, data)', 'licenseId', 'ALL', 'NO', 'q'],
  [1730, 'Goodwill', 'acquisitionId', 'ALL', 'NO', ''],
  [1740, 'Concession rights', 'concessionId', 'ALL', 'NO', 'q'],
  [1800, 'Property', 'propId', 'ALL', 'NO', 'q'],
  [1810, 'Construction in progress', 'projectId', 'ALL', 'NO', 'q'],
  [1830, 'Equipment and upgrades', 'bizId:axis', 'ALL', 'NO', 'q'],
  [1839, 'Accumulated depreciation (contra)', 'matching sub', 'ALL', 'NO', 'qC'],
  [1840, 'Computing hardware', 'clusterId', 'ALL', 'NO', 'q'],
  [1850, 'Vehicles, vessels, aircraft', 'assetId', 'ALL', 'NO', 'q'],
  [1860, 'Lifestyle durables', 'itemId', 'ALL', 'NO', 'q'],
  [1870, 'Collectibles', 'itemId', 'ALL', 'NO', 'q'],
  [1880, 'Storage and logistics infrastructure', 'assetId', 'ALL', 'NO', 'q'],
  [1900, 'Deferred tax assets', 'jurisdiction', 'ALL', 'NO', ''],
  [1909, 'Elastic sector advances', 'sectorId', ['sys'], 'NO', ''],
  [1910, 'Claim on the Stabilizer', null, ['cbk'], 'NO', ''],
  [1950, 'Due from owner / group current account', 'entityId', 'ALL', 'NO', ''],
  [1999, 'Suspense', null, 'ALL', 'NO', 'Z'],
  // ── 2xxx liabilities ──
  [2001, 'Settlement cash issued', 'holderId', ['cbk'], 'NO', ''],
  [2002, 'Reserves owed', 'bnkId / ccpId', ['cbk'], 'NO', ''],
  [2003, 'Treasury account owed', 'govId', ['cbk'], 'NO', ''],
  [2100, 'Customer deposits', 'holderId (term deposits: holderId:termId)', ['bnk'], 'NO', ''],
  [2110, 'Interbank borrowing', 'lenderId', 'ALL', 'NO', ''],
  [2120, 'Central-bank borrowing', 'facilityId', 'ALL', 'NO', ''],
  [2130, 'Repo borrowing', 'repoId', 'ALL', 'NO', ''],
  [2140, 'Margin received', 'memberId', ['ccp', 'bnk'], 'NO', ''],
  [2150, 'Default fund received', 'memberId', ['ccp'], 'NO', ''],
  [2160, 'Escrow held', 'contractId', ['ccp', 'crt'], 'NO', ''],
  [2200, 'Loans payable', 'loanId', 'ALL', 'NO', ''],
  [2201, 'Mortgages payable', 'loanId', 'ALL', 'NO', ''],
  [2202, 'Margin loans payable', 'accountId', 'ALL', 'NO', ''],
  [2203, 'Credit lines payable', 'lineId', 'ALL', 'NO', ''],
  [2206, 'P2P loans payable', 'contractId', 'ALL', 'NO', ''],
  [2300, 'Bonds issued', 'assetId', 'ALL', 'NO', 'q'],
  [2310, 'Sovereign debt issued', 'assetId', ['gov'], 'NO', 'q'],
  [2320, 'Tranches issued', 'trancheId', ['spv'], 'NO', 'q'],
  [2330, 'Stablecoins issued', 'tokenId', 'ALL', 'NO', 'q'],
  [2400, 'Taxes payable', 'jurisdiction:taxType:year', 'ALL', 'NO', ''],
  [2410, 'VAT payable', 'jurisdiction', 'ALL', 'NO', ''],
  [2420, 'Withholding tax payable', 'jurisdiction', 'ALL', 'NO', ''],
  [2430, 'Deferred tax liabilities', 'jurisdiction', 'ALL', 'NO', ''],
  [2500, 'Trade payables', 'counterpartyId', 'ALL', 'NO', ''],
  [2510, 'Wages payable', null, 'ALL', 'NO', ''],
  [2520, 'Interest payable', 'instrument or loanId', 'ALL', 'NO', ''],
  [2530, 'Dividends payable', 'assetId', 'ALL', 'NO', ''],
  [2540, 'Rent payable', 'propId', 'ALL', 'NO', ''],
  [2550, 'Fines and judgments payable', 'caseId', 'ALL', 'NO', ''],
  [2560, 'Restitution payable', 'caseId', 'ALL', 'NO', ''],
  [2570, 'Tenant deposits held', 'tenantId', 'ALL', 'NO', ''],
  [2580, 'Unearned revenue', 'ref', 'ALL', 'NO', ''],
  [2590, 'Accrued expenses', 'ref', 'ALL', 'NO', ''],
  [2600, 'Derivative liabilities', 'positionId', 'ALL', 'NO', 'q'],
  [2700, 'Claims reserves (case + IBNR)', 'lineId', ['ins'], 'NO', ''],
  [2710, 'Unearned premium reserve', 'lineId', ['ins'], 'NO', ''],
  [2800, 'Due to related parties', 'entityId', 'ALL', 'NO', ''],
  [2900, 'Issuance owed to central bank', 'ccy', ['sys'], 'NO', ''],
  [2909, 'Owed to elastic sectors', 'sectorId', ['sys'], 'NO', ''],
  [2950, "Owner's current account", 'ownerId', ['biz', 'prop'], 'NO', ''],
  [2990, 'Persistent claims after discharge', 'creditorId', 'ALL', 'NO', ''],
  [2999, 'Suspense', null, 'ALL', 'NO', 'Z'],
  // ── 3xxx equity ──
  [3100, 'Share capital', 'shareClass', 'ALL', 'NO', 'q'],
  [3110, 'Share premium', null, 'ALL', 'NO', ''],
  [3150, 'Treasury shares (contra)', null, 'ALL', 'NO', 'qC'],
  [3200, 'Retained earnings', null, 'ALL', 'NO', ''],
  [3300, 'Current-period result', null, 'ALL', 'NO', ''],
  [3400, 'Revaluation surplus', null, 'ALL', 'NO', ''],
  [3500, 'FX translation reserve', null, 'ALL', 'NO', 'X'],
  [3600, 'Non-controlling interests', null, 'ALL', 'NO', 'X'],
  [3700, 'Fund capital', null, ['fnd'], 'NO', ''],
  [3800, 'Currency trading accounts', 'ccy', 'ALL', 'NO', ''],
  [3900, "Owner's equity", null, ['chr', 'ali'], 'NO', ''],
  [3990, 'Net issuance', null, ['sys'], 'NO', ''],
  // ── 4xxx income ──
  [4000, 'Sales revenue', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4010, 'Rental income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4020, 'Interest income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4030, 'Dividend income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4040, 'Fees and commissions income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4050, 'Insurance premiums earned', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4060, 'Realized trading gains', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4070, 'Unrealized gains (fair value)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4080, 'FX gains (realized)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4090, 'Gains on disposal of non-financial assets', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4100, 'Subsidies and grants', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4110, 'Faucet income (start cash, grants, ads, rewards, compensation)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4120, 'Judgments, restitution and settlements received', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4130, 'Gains on debt extinguishment', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4140, 'Royalties and licence income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4150, 'Investment income from controlled entities (look-through result)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4190, 'Other income', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [4900, 'System burn income', 'segment, counterparty class or asset', ['sys'], 'NO', ''],
  // ── 5xxx expenses ──
  [5000, 'Cost of goods sold', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5010, 'Wages and staff', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5020, 'Rent', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5030, 'Energy', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5040, 'Upkeep and maintenance', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5050, 'Marketing', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5060, 'Compute and data', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5070, 'Professional and legal fees', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5080, 'Fees, commissions and levies paid', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5090, 'Interest expense', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5100, 'Insurance premiums', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5110, 'Claims incurred', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5120, 'Depreciation', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5130, 'Amortization', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5140, 'Impairment and write-downs', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5150, 'Credit-loss expense', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5160, 'Realized trading losses', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5170, 'Unrealized losses (fair value)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5180, 'FX losses (realized)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5190, 'Losses on disposal', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5200, 'Lifestyle consumption', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5210, 'Fines and penalties', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5220, 'Restitution and settlements paid', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5230, 'Security, defence and operations', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5240, 'Lobbying, donations, hosting', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5250, 'Licences, charters, registrations', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5260, 'Property and other non-income taxes', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5270, 'Irrecoverable VAT', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5280, 'Transaction taxes', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [5900, 'Net issuance expense', 'segment, counterparty class or asset', ['sys'], 'NO', ''],
  // ── 6xxx income taxes ──
  [6000, 'Current income tax', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [6010, 'Deferred tax', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  [6020, 'Withholding tax suffered (non-creditable part)', 'segment, counterparty class or asset', 'ALL', 'NO', ''],
  // ── 9xxx memo and system ──
  [9100, 'Collateral received (title retained by giver: pledges)', 'assetId (qty)', 'ALL', 'NO', 'q'],
  [9110, 'Securities lent out (flag on the 15xx lot)', 'assetId (qty)', 'ALL', 'NO', 'q'],
  [9200, 'Encumbrances register', 'assetId', 'ALL', 'NO', ''],
  [9300, 'Holds mirror (02 holds)', 'holdId', 'ALL', 'NO', ''],
  [9900, 'Interpartition suspense', 'A->B', ['sys'], 'NO', ''],
  [9910, 'Challenge-event books', 'bookId', 'ALL', 'NO', ''],
];

/** Class by first digit (03 §3.2): 1 ASSET, 2 LIABILITY, 3 EQUITY, 4 INCOME, 5/6 EXPENSE, 9 MEMO. */
export function classOfCode(code: number): AccountClass | undefined {
  const d = Math.floor(code / 1000);
  return (['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'EXPENSE', undefined, undefined, 'MEMO'] as const)[d - 1];
}

const chartEntryOf = (r: ChartRow): ChartEntry => ({
  code: r[0], name: r[1], cls: classOfCode(r[0]) as AccountClass, subMeaning: r[2],
  // 03 §2.2: `isMoney` is true for 1001, 1002, 1003 and 1010, and for 1009 (the virtual money of the elastic sectors).
  // The kind-dependent question ("is this code money for THIS entity kind?") is `isMoneyCode`.
  isMoney: r[4] !== 'NO',
  kinds: r[3], qtyBearing: r[5].includes('q'), contra: r[5].includes('C'), mustBeZeroAtP13: r[5].includes('Z'),
  consolidatedOnly: r[5].includes('X'),
});

/** The complete chart of accounts, keyed by the 4-digit code (byte order = numeric order). */
export const CHART: SortedMap<string, ChartEntry> = (() => {
  const m = new SortedMap<string, ChartEntry>();
  for (const r of CHART_ROWS) m.set(String(r[0]).padStart(4, '0'), chartEntryOf(r));
  return m;
})();

/** The money flag of every code: 'ALL' (money for every kind), 'ELASTIC' (virtual money of hh/frm/row) or 'NO'. */
const CHART_MONEY: SortedMap<string, MoneyFlag> = (() => {
  const m = new SortedMap<string, MoneyFlag>();
  for (const r of CHART_ROWS) m.set(String(r[0]).padStart(4, '0'), r[4]);
  return m;
})();

/** The chart row of a code (undefined for a code outside the chart). */
export function chartEntry(code: number): ChartEntry | undefined {
  return CHART.get(String(code).padStart(4, '0'));
}

/**
 * Money accounts (03 §2.2): 1001, 1002, 1003 and 1010 hold money for every kind; 1009 is the virtual money of the
 * elastic sectors only and never counts in M0 (03 §3.5.2). The money flag is per code and independent of the
 * code's kind restriction (`kindMayUse`): 1003 is money for every kind even though only a gov may hold it.
 */
export function isMoneyCode(code: number, kind: EntityKind | undefined): boolean {
  const flag = CHART_MONEY.get(String(code).padStart(4, '0'));
  if (flag === undefined || flag === 'NO') return false;
  if (flag === 'ELASTIC') return kind !== undefined && isElasticKind(kind);
  return true;
}

/** Whether an entity kind may hold an account of this code (03 §2.1 template + the chart's Notes column). */
export function kindMayUse(code: number, kind: EntityKind): boolean {
  const e = chartEntry(code);
  if (!e) return false;
  return e.kinds === 'ALL' || e.kinds.includes(kind);
}

/** Base-money accounts (BMA, spec §2.5) and deposits. 1009 is virtual elastic money (never M0/M2). */
export const BMA_CODES = [1001, 1002, 1003] as const;
/** T03-06 defaultMoneyCode: bnk, ccp -> 1002 reserves; gov -> 1003 treasury; others 1001 settlement cash. */
export function defaultMoneyCode(kind: EntityKind | undefined): 1001 | 1002 | 1003 {
  return kind === 'bnk' || kind === 'ccp' ? 1002 : kind === 'gov' ? 1003 : 1001;
}
/** cbk holder liability mirroring a holder BMA (03 §3.5.3). */
export const cbMirrorCode = (bma: 1001 | 1002 | 1003): 2001 | 2002 | 2003 => (bma + 1000) as 2001 | 2002 | 2003;
/**
 * 03 §3.3.8: the marketable positions revalued to the day-close mark. 1220 OWNED is excluded (cost, not a mark).
 */
export const MARKETABLE_CODES: readonly number[] = [1500, 1510, 1520, 1530, 1540, 1541, 1542, 1560, 1600, 2600, 1210, 1870];
export const RESTRICTED_PREFIX = 'RESTRICTED:';
export const restrictedSub = (releaseTick: number, tag: string): string => `${RESTRICTED_PREFIX}${releaseTick}:${tag}`;
