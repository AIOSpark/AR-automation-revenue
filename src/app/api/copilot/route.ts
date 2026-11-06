import { NextRequest, NextResponse } from 'next/server';
import { cfoIntelligenceEngine } from '@/lib/cfo/engine';
import { udmStore } from '@/lib/udm/store';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { AuditService } from '@/lib/audit/service';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';

export async function POST(req: NextRequest) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'view', 'invoices');
    if (permissionError) return permissionError;

    const body = await req.json();
    const { prompt, history, currentPath = '/dashboard' } = body;
    const organizationId = context!.organization.id;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    udmStore.setTenantContext(organizationId);
    const overview = cfoIntelligenceEngine.getOverview(organizationId);

    const formatCurrency = (cents: number) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(cents / 100);
    };

    const cleanPrompt = prompt.toLowerCase().trim();

    // Context metrics
    const totalAR = overview.totalReceivablesMinorUnits;
    const overdueAR = overview.overdueMinorUnits || 0;
    const blockedCash = overview.actionableBlockersMinorUnits;
    const dso = overview.dsoDays || 0;
    const topDebtor = overview.topCustomerExposures?.[0];
    const topAction = overview.topActions?.[0];
    const exceptionCount = udmStore.getExceptions().length;
    const overdueShare = totalAR > 0 ? ((overdueAR / totalAR) * 100).toFixed(1) : '0.0';

    // Intent 1: Why is cash stuck / Root causes / Blockers
    if (
      cleanPrompt.includes('why') && (cleanPrompt.includes('stuck') || cleanPrompt.includes('overdue') || cleanPrompt.includes('blocked')) ||
      cleanPrompt.includes('blocker') || cleanPrompt.includes('root cause') || cleanPrompt.includes('breakdown')
    ) {
      const breakdown = overview.categoryBreakdown || [];
      const categoryLines = breakdown.length > 0
        ? breakdown.map((item, index) => `${index + 1}. **${item.title}**: ${formatCurrency(item.amountMinorUnits)} (${item.percentageOfActionableTotal.toFixed(1)}%)`).join('\n')
        : 'No categorized blockers are currently recorded.';

      return NextResponse.json({
        success: true,
        response: {
          text: `Your receivables ledger currently has **${formatCurrency(overdueAR)}** overdue (${overdueShare}% of outstanding AR), with **${formatCurrency(blockedCash)}** tied up in actionable exceptions.\n\nHere is the current root-cause breakdown:\n\n${categoryLines}`,
          suggestions: [
            topAction ? `Investigate ${topAction.customerName}` : 'Open Receivables',
            topAction ? `Draft follow-up for ${topAction.customerName}` : 'Review data quality',
            'Simulate cash recovery next 14 days',
          ],
          action: 'VIEW_BLOCKERS',
          actionLabel: 'Filter by PO Mismatches',
          actionPayload: { category: 'PO_MISMATCH' },
          data: {
            overdue: formatCurrency(overdueAR),
            blocked: formatCurrency(blockedCash),
            dso: `${dso} days`,
            categories: breakdown.map(b => ({
              title: b.title,
              amount: formatCurrency(b.amountMinorUnits),
              pct: b.percentageOfActionableTotal,
            })),
          },
        },
      });
    }

    // Intent 2: Investigate the actual top-ranked exposure; never invent a customer or invoice.
    if (
      cleanPrompt.includes('nexus') || cleanPrompt.includes('bottleneck') || cleanPrompt.includes('top action') ||
      cleanPrompt.includes('investigate') || cleanPrompt.includes('inv-8841')
    ) {
      if (!topAction || !topDebtor) {
        return NextResponse.json({
          success: true,
          response: {
            text: 'There is not enough live receivables data to identify a bottleneck yet. Import or sync your ledger, then ask me to investigate again.',
            suggestions: ['Open Receivables', 'Connect an ERP', 'Review data quality'],
            action: 'NAVIGATE',
            actionLabel: 'Open Receivables',
            actionPayload: { path: '/receivables' },
          },
        });
      }

      return NextResponse.json({
        success: true,
        response: {
          text: `### Investigation Report: ${topAction.customerName} (${topAction.invoiceNumber})\n\n- **Exposure**: **${formatCurrency(topAction.outstandingAmountMinorUnits)}**\n- **Customer Profile**: ${topDebtor.riskBand.toUpperCase()} risk • DSO ${topDebtor.dsoDays} days\n- **Root Cause**: **${topAction.categoryTitle}**\n- **Recommended Resolution**: ${topAction.recommendedAction} (Confidence: **${Math.round(topAction.confidenceScore * 100)}%**).`,
          suggestions: [
            'Approve and resubmit revised invoice',
            'Draft polite follow-up notice',
            'Who else is in high risk tier?',
          ],
          action: 'EXECUTE_PO_CORRECTION',
          actionLabel: 'Submit for Controller Approval',
            actionPayload: {
            invoiceId: topAction.invoiceId,
            customerId: topAction.customerId,
            invoiceNumber: topAction.invoiceNumber,
            customerName: topAction.customerName,
            amount: formatCurrency(topAction.outstandingAmountMinorUnits),
            confidence: Math.round(topAction.confidenceScore * 100),
          },
        },
      });
    }

    // Intent 3: Draft dunning email / follow-up communication
    if (
      cleanPrompt.includes('draft') || cleanPrompt.includes('email') || cleanPrompt.includes('dunning') ||
      cleanPrompt.includes('reminder') || cleanPrompt.includes('message') || cleanPrompt.includes('apex')
    ) {
      const draftAction = topAction;
      const draftCustomer = draftAction ? udmStore.getCustomers().find((customer) => customer.id === draftAction.customerId) : null;
      const draftContact = draftCustomer ? udmStore.getContacts(draftCustomer.id).find((contact) => contact.is_primary) || udmStore.getContacts(draftCustomer.id)[0] : null;
      if (!draftAction || !draftCustomer || !draftContact?.email) {
        return NextResponse.json({
          success: true,
          response: {
            text: 'I cannot draft a customer communication because the top live exposure does not have a verified customer contact email.',
            suggestions: ['Open Customers', 'Review data quality', 'Connect an ERP'],
            action: 'NAVIGATE',
            actionLabel: 'Open Customers',
            actionPayload: { path: '/customers' },
          },
        });
      }
      const emailDraft = {
        to: draftContact.email,
        customerId: draftCustomer.id,
        invoiceId: draftAction.invoiceId,
        subject: `Follow-up: overdue invoice ${draftAction.invoiceNumber}`,
        body: `Dear ${draftCustomer.name} Finance Team,\n\nWe are following up on invoice ${draftAction.invoiceNumber} with an outstanding balance of ${formatCurrency(draftAction.outstandingAmountMinorUnits)}.\n\nPlease reply with the expected payment date or any documentation needed to resolve the ${draftAction.categoryTitle.toLowerCase()} blocker.\n\nRegards,\nAIOSpark Accounts Receivable Team`,
      };

      return NextResponse.json({
        success: true,
        response: {
          text: `I prepared a policy-gated dunning communication for **${draftCustomer.name}** regarding **${draftAction.invoiceNumber}** (${formatCurrency(draftAction.outstandingAmountMinorUnits)}).\n\nYou can review, copy, or queue this message for approval:`,
          suggestions: [
            'Send via connected email',
            'Make tone more urgent / escalation',
            'Show payment history for Apex Logistics',
          ],
          action: 'DRAFT_EMAIL',
          actionLabel: 'Queue Email for Approval',
          actionPayload: emailDraft,
          data: {
            emailDraft,
          },
        },
      });
    }

    // Intent 4: Simulate cash unblock / forecasting
    if (
      cleanPrompt.includes('simulate') || cleanPrompt.includes('forecast') || cleanPrompt.includes('recovery') ||
      cleanPrompt.includes('unblock') || cleanPrompt.includes('dso')
    ) {
      return NextResponse.json({
        success: true,
        response: {
          text: `### Current Cash Unblock Position\n\nThis view is grounded in the live tenant ledger. It does not claim a forecast without historical payment data.\n\n- **Actionable exposure**: **${formatCurrency(blockedCash)}**\n- **Overdue exposure**: **${formatCurrency(overdueAR)}**\n- **Current DSO**: **${dso} days**\n- **Top ranked actions available**: **${overview.topActions.length}**`,
          suggestions: [
            'Approve top 3 exceptions now',
            'Open Cash Unblock Simulator',
            'Review aging brackets',
          ],
          action: 'NAVIGATE',
          actionLabel: 'Open Cash Unblock Simulator',
          actionPayload: { path: '/cash-unblock' },
        },
      });
    }

    // Intent 5: Approvals / Audit
    if (
      cleanPrompt.includes('approval') || cleanPrompt.includes('audit') || cleanPrompt.includes('pending') ||
      cleanPrompt.includes('guardrail')
    ) {
      return NextResponse.json({
        success: true,
        response: {
          text: `### Pending Controller Approvals\n\nThere are currently **${overview.pendingApprovals.length} actions** awaiting human sign-off before dispatch. The queue is tenant-scoped and approval-gated.`,
          suggestions: [
            'Approve all 3 actions',
            'Go to Approvals Management',
            'Audit recent activity logs',
          ],
          action: 'NAVIGATE',
          actionLabel: 'Go to Approvals Hub',
          actionPayload: { path: '/approvals' },
        },
      });
    }

    // Default / Conversational financial assistance
    return NextResponse.json({
      success: true,
      response: {
        text: `I've analyzed the live receivables workstation:\n\n- **Total Outstanding AR**: **${formatCurrency(totalAR)}**\n- **Overdue Exposure**: **${formatCurrency(overdueAR)}** (${overdueShare}% of ledger)\n- **Days Sales Outstanding (DSO)**: **${dso} days**\n- **Actionable Blocked Cash**: **${formatCurrency(blockedCash)}** across ${exceptionCount} exceptions\n\nI can help you inspect blockers, review real customer exposure, or open the approval queue.`,
        suggestions: [
          'Why is cash stuck?',
          topAction ? `Investigate ${topAction.customerName}` : 'Open Receivables',
          topAction ? `Draft follow-up for ${topAction.customerName}` : 'Review data quality',
          'Simulate cash recovery next 14 days',
        ],
      },
    });
  } catch (error: any) {
    console.error('Copilot API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal copilot error' },
      { status: 500 }
    );
  }
}
