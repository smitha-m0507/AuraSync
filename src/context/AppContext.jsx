import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { reportsAPI } from '../services/api.js';

const AppContext = createContext(null);

// API reports keep the visual in `visualData`; the UI reads `data`.
export const normalizeReport = (row) => ({ ...row, data: row.visualData ?? row.data });

export function AppProvider({ children }) {
  const [reports, setReports] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  const refreshReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportsAPI.getAll();
      setReports((response.data.data.reports || []).map(normalizeReport));
      setPagination(response.data.data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      setLoadError('');
    } catch (error) {
      setReports([]);
      setLoadError(error.response?.data?.error?.message || 'Could not load reports from the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveReport = useCallback(async (report) => {
    const response = await reportsAPI.save({
      jobId: report.jobId,
      title: report.title,
      outputType: report.outputType,
      speakerCount: report.speakerCount,
      executiveSummary: report.executiveSummary,
      tags: report.tags,
      visualData: report.data,
      transcript: report.transcript,
      segments: report.segments,
      summary: report.summary,
      speakers: report.speakers,
      evaluation: report.evaluation,
      chatHistory: report.chatHistory
    });
    const savedReport = { ...report, id: response.data.data.id, createdAt: response.data.data.createdAt };
    setReports((current) => [savedReport, ...current]);
    return savedReport;
  }, []);

  const deleteReport = useCallback(async (id) => {
    try {
      await reportsAPI.delete(id);
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setReports((current) => current.filter((report) => report.id !== id));
  }, []);

  const toggleStar = useCallback(async (id) => {
    try {
      const response = await reportsAPI.toggleStar(id);
      setReports((current) =>
        current.map((report) =>
          report.id === id ? { ...report, isStarred: response.data.data.isStarred } : report
        )
      );
    } catch (error) {
      console.error('Toggle star failed:', error);
    }
  }, []);

  const loadMoreReports = useCallback(async () => {
    if (pagination.page >= pagination.totalPages) return;
    
    try {
      const response = await reportsAPI.getAll({ page: pagination.page + 1, limit: pagination.limit });
      setReports((current) => [...current, ...response.data.data.reports.map(normalizeReport)]);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Load more failed:', error);
    }
  }, [pagination]);

  const value = useMemo(
    () => ({
      reports,
      saveReport,
      deleteReport,
      toggleStar,
      loadMoreReports,
      loading,
      loadError,
      refreshReports,
      pagination,
      apiKey,
      setApiKey
    }),
    [reports, loading, loadError, pagination, apiKey]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}