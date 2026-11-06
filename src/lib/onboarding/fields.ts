export interface TargetFieldDef {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

export const TARGET_FIELDS: TargetFieldDef[] = [
  { key: 'customer_name', label: 'Customer Name', required: true, aliases: ['customer', 'client', 'buyer', 'party_name', 'customer_name'] },
  { key: 'invoice_number', label: 'Invoice Number', required: true, aliases: ['invoice', 'inv_no', 'inv_num', 'bill_no', 'invoice_number'] },
  { key: 'amount', label: 'Invoice Amount', required: true, aliases: ['amount', 'value', 'total', 'billed_amount', 'sum'] },
  { key: 'currency', label: 'Currency', required: false, aliases: ['curr', 'currency'] },
  { key: 'issue_date', label: 'Issue Date', required: true, aliases: ['date', 'bill_date', 'invoice_date', 'issue_date'] },
  { key: 'due_date', label: 'Due Date', required: false, aliases: ['due', 'payment_due', 'due_date'] },
  { key: 'status', label: 'Status', required: false, aliases: ['status', 'payment_status', 'state'] },
  { key: 'po_number', label: 'PO Number', required: false, aliases: ['po', 'po_no', 'purchase_order', 'po_number'] },
];
