import { NextResponse } from 'next/server';
import { getLocationConfigs } from '@/lib/psa-config';
import { createPSAAdapterForConfig } from '@/lib/psa-adapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug-search?location=t19&seq=3520,3159,3442,3447,3436,3404,3390
 *
 * Searches PSA's Open and Closed job lists for specific job number sequences.
 * Scans ALL pages of both lists to find jobs regardless of how deep they are.
 * Does NOT enrich — just shows raw list data to identify where jobs live.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get('location') || 't19';
  const seqParam = url.searchParams.get('seq') || '3520,3159,3442,3447,3436,3404,3390';
  const targetSeqs = seqParam.split(',').map(s => s.trim());

  const config = getLocationConfigs().find(c => c.id === locationId);
  if (!config) {
    return NextResponse.json({ error: `Unknown location: ${locationId}` }, { status: 400 });
  }

  // Access PSA session directly via internal class
  // We need raw list access, so we create a fresh adapter
  const results: {
    seq: string;
    found: boolean;
    list: string;
    jobNumber: string;
    rawRow: string[];
    territory: string;
    year: string;
    type: string;
  }[] = [];

  try {
    // Search both Open and Closed lists
    for (const option of ['Open', 'Closed']) {
      let offset = 0;
      const pageSize = 300;
      let total: number | null = null;
      let pagesScanned = 0;
      const maxPages = option === 'Closed' ? 10 : 5; // Scan up to 3000 closed, 1500 open

      while ((total === null || offset < total) && pagesScanned < maxPages) {
        // Use fetch directly to PSA
        const baseUrl = config.baseUrl;
        const loginUrl = `${baseUrl}/Account/Login`;
        const listUrl = `${baseUrl}/Job/Job/ListFilter`;

        // Login first
        const loginRes = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            Username: config.username,
            Password: config.password,
            Schema: config.schema,
          }).toString(),
          redirect: 'manual',
        });

        const cookies = loginRes.headers.getSetCookie?.() || [];
        const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

        if (!cookieStr) {
          return NextResponse.json({ error: 'Login failed — no cookies' }, { status: 500 });
        }

        // Fetch job list page
        const formData = new URLSearchParams();
        formData.set('option', option);
        formData.set('iDisplayStart', String(offset));
        formData.set('iDisplayLength', String(pageSize));
        formData.set('sEcho', '1');
        formData.set('iColumns', '11');
        formData.set('iSortCol_0', '8');
        formData.set('sSortDir_0', 'desc');
        formData.set('iSortingCols', '1');
        formData.set('mDataProp_10', 'id');
        for (let i = 0; i < 10; i++) {
          formData.set(`mDataProp_${i}`, `col${i}`);
        }

        const listRes = await fetch(listUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookieStr,
          },
          body: formData.toString(),
        });

        const body = await listRes.text();
        if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
          break; // Session issue
        }

        const data = JSON.parse(body);
        total = data.iTotalDisplayRecords || 0;
        const rows = data.aaData || [];

        for (const row of rows) {
          const jobNum = String(row[0] || row[1] || '');
          for (const seq of targetSeqs) {
            if (jobNum.includes(seq) && !results.find(r => r.seq === seq && r.jobNumber === jobNum)) {
              // Parse job number parts
              const parts = jobNum.split('-');
              results.push({
                seq,
                found: true,
                list: option,
                jobNumber: jobNum,
                rawRow: row.slice(0, 10).map(String),
                territory: parts[0] || '',
                year: parts[1] || '',
                type: parts.length >= 4 ? parts[3].split(';')[0] : '',
              });
            }
          }
        }

        offset += pageSize;
        pagesScanned++;

        if (rows.length < pageSize) break;
      }
    }

    // Check which sequences were NOT found
    const missing = targetSeqs.filter(seq => !results.find(r => r.seq === seq));

    return NextResponse.json({
      location: config.name,
      searchedFor: targetSeqs,
      found: results,
      missing,
      foundCount: results.length,
      missingCount: missing.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
