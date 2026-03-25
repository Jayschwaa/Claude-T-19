'use client';

import { useState, useCallback } from 'react';
import { ScoredJob, DashboardSummary } from '@/lib/types';
import SummaryBar from './SummaryBar';
import JobList from './JobList';

// The "view mode" set by clicking a top-panel box
export type ViewMode = 'priority' | 'revenue' | 'ticket-expansion' | 'upsell' | 'iicrc-gaps' | 'ticket-gaps';

interface Props {
  scoredJobs: ScoredJob[];
  summary: DashboardSummary;
}

export default function DashboardClient({ scoredJobs, summary }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('priority');
  const [statusFromBar, setStatusFromBar] = useState<string | null>(null);

  const handleBoxClick = useCallback((mode: ViewMode) => {
    // Toggle: click the same box again to go back to default priority
    setViewMode(prev => prev === mode ? 'priority' : mode);
    setStatusFromBar(null); // clear pipeline filter when switching box
  }, []);

  const handleStatusClick = useCallback((status: string) => {
    // Toggle: click same status to clear
    setStatusFromBar(prev => prev === status ? null : status);
    setViewMode('priority'); // reset to default sort when filtering by status
  }, []);

  return (
    <>
      <SummaryBar
        summary={summary}
        activeView={viewMode}
        activeStatus={statusFromBar}
        onBoxClick={handleBoxClick}
        onStatusClick={handleStatusClick}
      />
      <JobList
        scoredJobs={scoredJobs}
        summary={summary}
        viewMode={viewMode}
        statusFromBar={statusFromBar}
      />
    </>
  );
}
