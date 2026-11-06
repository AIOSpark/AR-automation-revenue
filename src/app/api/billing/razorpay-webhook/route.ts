import { NextRequest, NextResponse } from 'next/server';
import { RazorpayBillingService } from '@/lib/billing/razorpay-service';

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(req: NextRequest) {
  try {
    if (!RazorpayBillingService.isWebhookConfigured()) {
      return NextResponse.json({ error: 'Razorpay webhook signing secret is not configured.' }, { status: 503 });
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (declaredLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
    }

    const signature = req.headers.get('x-razorpay-signature') || '';
    if (!signature) {
      return NextResponse.json({ error: 'Missing Razorpay signature header.' }, { status: 400 });
    }

    const result = await RazorpayBillingService.processWebhookEvent(rawBody, signature);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message, eventType: result.eventType }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 });
  }
}
