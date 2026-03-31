import { NextRequest, NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { debugJobDetail } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-financial?jobId=12345
 *
 * Fetches raw financial data from PSA for a specific job ID.
 * Shows the detail page revenue fields and financial table parsing.
 */
export async function GET(request: NextRequest) {
  const jobIdStr = request.nextUrl.searchParams.get('jobId');
  if (!jobIdStr) {
    return NextResponse.json({ error: 'Missing jobId parameter. Use ?jobId=12345' }, { status: 400 });
  }

  const jobId = parseInt(jobIdStr);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: 'jobId must be a number' }, { status: 400 });
  }

  try {
    const config = getLocationConfigs()[0]; // T-19
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Use the PSA session to fetch financial data directly
    const { PSASession } = await import('@/lib/psa-adapter') as any;

    // Fetch detail page
    const detail = await debugJobDetail(jobId);

    // Also fetch financial page directly to see raw HTML
    const loginRes = await fetch(`${config.baseUrl}/Account/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        Username: config.username,
        Password: config.password,
        Schema: config.schema,
      }).toString(),
      redirect: 'manual',
    });

    const rawCookies = loginRes.headers.getSetCookie?.() || [];
    const cookieStr = rawCookies.map((c: string) => c.split(';')[0]).join('; ');

    // Follow redirect to transfer
    const location = loginRes.headers.get('location') || '';
    if (location) {
      await fetch(`${config.baseUrl}${location}`, {
        method: 'GET',
        headers: { Cookie: cookieStr },
        redirect: 'manual',
      });
    }

    const financialRes = await fetch(
      `${config.baseUrl}/Job/Financial/List?linkID=${jobId}&UpdateTargetId=FinancialTab&Source=Job`,
      { headers: { Cookie: cookieStr } },
    );
    const financialHtml = await financialRes.text();

    // Extract key financial tokens
    const cleanHtml = financialHtml.replace(/<script[^>]*>.*?<\/script>/gs, '').replace(/<[^>]+>/g, '\t');
    const tokens = cleanHtml.split('\t').map((t: string) => t.trim()).filter(Boolean);
    const revenueIdx = tokens.findIndex((t: string) => t === 'Revenue');
    const revenueContext = revenueIdx >= 0 ? tokens.slice(revenueIdx, revenueIdx + 8) : [];

    // Hidden input totals
    const totalRevEstMatch = financialHtml.match(/name="TotalRevenue\.Estimate"[^>]*value="([^"]*)"/i)
      || financialHtml.match(/id="TotalRevenue_Estimate"[^>]*value="([^"]*)"/i);
    const totalRevActMatch = financialHtml.match(/name="TotalRevenue\.Actual"[^>]*value="([^"]*)"/i)
      || financialHtml.match(/id="TotalRevenue_Actual"[^>]*value="([^"]*)"/i);

    return NextResponse.json({
      jobId,
      detail,
      financial: {
        htmlLength: financialHtml.length,
        isHtmlPage: financialHtml.trimStart().startsWith('<!DOCTYPE') || financialHtml.trimStart().startsWith('<html'),
        totalRevEstimate: totalRevEstMatch?.[1] || 'NOT FOUND',
        totalRevActual: totalRevActMatch?.[1] || 'NOT FOUND',
        revenueTokenContext: revenueContext,
        totalTokens: tokens.length,
        first50tokens: tokens.slice(0, 50),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
