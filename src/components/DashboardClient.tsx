'use client';

import { useState, useCallback } from 'react';
import { ScoredJob, DashboardSummary, LocationData } from '@/lib/types';
import SummaryBar from './SummaryBar';
import JobList from './JobList';

// The "view mode" set by clicking a top-panel box
export type ViewMode = 'priority' | 'revenue' | 'ticket-expansion' | 'upsell' | 'iicrc-gaps' | 'ticket-gaps';

interface Props {
  locationDataList: LocationData[];
  showTabs: boolean;
}

export default function DashboardClient({ locationDataList, showTabs }: Props) {
  const [activeLocationId, setActiveLocationId] = useState<string>(locationDataList[0]?.id || '');
  const [viewMode, setViewMode] = useState<ViewMode>('priority');
  const [statusFromBar, setStatusFromBar] = useState<string | null>(null);

  const activeLocation = locationDataList.find(ld => ld.id === activeLocationId) || locationDataList[0];

  const handleBoxClick = useCallback((mode: ViewMode) => {
    setViewMode(prev => prev === mode ? 'priority' : mode);
    setStatusFromBar(null);
  }, []);

  const handleStatusClick = useCallback((status: string) => {
    setStatusFromBar(prev => prev === status ? null : status);
    setViewMode('priority');
  }, []);

  if (!activeLocation) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No location data available</p>
      </div>
    );
  }

  return (
    <>
      {showTabs && (
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-4">
            {locationDataList.map(ld => (
              <button
                key={ld.id}
                onClick={() => setActiveLocationId(ld.id)}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeLocationId === ld.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {ld.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <SummaryBar
        summary={activeLocation.summary}
        activeView={viewMode}
        activeStatus={statusFromBar}
        onBoxClick={handleBoxClick}
        onStatusClick={handleStatusClick}
      />
      <JobList
        scoredJobs={activeLocation.scoredJobs}
        summary={activeLocation.summary}
        viewMode={viewMode}
        statusFromBar={statusFromBar}
      />
    </>
  );
}
