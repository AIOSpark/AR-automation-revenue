// AIOSpark Payment-Delay Classification Taxonomy Definitions & Governance (Layer 14)

export const PAYMENT_DELAY_CATEGORIES = [
  'NORMAL_CYCLE',
  'PAYMENT_PROMISED',
  'CUSTOMER_DISPUTE',
  'PO_MISMATCH',
  'INVOICE_ERROR',
  'GST_TAX_ISSUE',
  'MISSING_DOCUMENT',
  'DELIVERY_ISSUE',
  'APPROVAL_PENDING',
  'CREDIT_ISSUE',
  'UNKNOWN',
] as const;

export type PaymentDelayCategory = (typeof PAYMENT_DELAY_CATEGORIES)[number];

export interface CategoryDefinition {
  category: PaymentDelayCategory;
  title: string;
  definition: string;
}

export const categoryDefinitionsMap: Map<PaymentDelayCategory, CategoryDefinition> = new Map([
  ['NORMAL_CYCLE', { category: 'NORMAL_CYCLE', title: 'Normal Payment Cycle', definition: 'The invoice is processing normally within agreed credit terms with no detected blockers.' }],
  ['PAYMENT_PROMISED', { category: 'PAYMENT_PROMISED', title: 'Payment Promised', definition: 'The customer has committed to a specific payment date or remittance schedule.' }],
  ['CUSTOMER_DISPUTE', { category: 'CUSTOMER_DISPUTE', title: 'Customer Dispute', definition: 'The customer has formally logged a dispute regarding pricing, goods quality, or service delivery.' }],
  ['PO_MISMATCH', { category: 'PO_MISMATCH', title: 'PO Mismatch', definition: 'The invoice quantity, unit pricing, or line items do not match the associated purchase order.' }],
  ['INVOICE_ERROR', { category: 'INVOICE_ERROR', title: 'Invoice Error', definition: 'The invoice contains calculation errors, wrong billing details, or duplicate billing.' }],
  ['GST_TAX_ISSUE', { category: 'GST_TAX_ISSUE', title: 'GST Tax Issue', definition: 'Tax identification, GST rate, or tax credit reconciliation mismatch identified.' }],
  ['MISSING_DOCUMENT', { category: 'MISSING_DOCUMENT', title: 'Missing Document', definition: 'Required supporting documentation (Proof of Delivery, Bill of Lading, PO copy) is missing.' }],
  ['DELIVERY_ISSUE', { category: 'DELIVERY_ISSUE', title: 'Delivery Issue', definition: 'Goods or services were delivered late, damaged, or partially fulfilled.' }],
  ['APPROVAL_PENDING', { category: 'APPROVAL_PENDING', title: 'Approval Pending', definition: 'Invoice is awaiting internal Accounts Payable or departmental manager approval step at buyer.' }],
  ['CREDIT_ISSUE', { category: 'CREDIT_ISSUE', title: 'Credit / Liquidity Issue', definition: 'Customer is experiencing liquidity constraints, cash flow difficulties, or credit limit hold.' }],
  ['UNKNOWN', { category: 'UNKNOWN', title: 'Needs Classification', definition: 'Inconclusive or sparse signals — requires manual finance review and human classification.' }],
]);

/**
 * Validates whether a category string belongs strictly to the 11-value locked taxonomy.
 */
export function isValidTaxonomyCategory(cat: string): cat is PaymentDelayCategory {
  return PAYMENT_DELAY_CATEGORIES.includes(cat as PaymentDelayCategory);
}
