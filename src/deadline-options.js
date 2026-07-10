// Shared approval-hook deadline options. Data-only leaf module to avoid create/discover dependency cycles.

export var DEADLINE_OPTIONS = [
  { key: '3hours', label: '3-hour deadline', detailLabel: '3 hours', short: '3h', contract: 'JBDeadline3Hours' },
  { key: '1day', label: '1-day deadline', detailLabel: '1 day', short: '1 day', contract: 'JBDeadline1Day', def: true },
  { key: '3days', label: '3-day deadline', detailLabel: '3 days', short: '3 days', contract: 'JBDeadline3Days' },
  { key: '7days', label: '7-day deadline', detailLabel: '7 days', short: '7 days', contract: 'JBDeadline7Days' },
  { key: 'none', label: 'No deadline', detailLabel: 'No deadline', short: '', contract: null },
];
