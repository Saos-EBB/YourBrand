export const MEDIA_PROCESSING_QUEUE = 'media-processing';
export const AUTO_SUSPEND_QUEUE = 'auto-suspend';
export const MEDIA_TICKET_QUEUE = 'media-ticket';
export const GDPR_EXPORT_QUEUE = 'gdpr-export';

// Shared across all queues registered via BullModule.registerQueue(..., { defaultJobOptions }).
// 3 retries with exponential backoff so a transient failure (S3 hiccup, DB
// blip) self-heals without manual intervention; removeOnComplete/Fail caps
// keep Redis from growing unbounded with job history.
export const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
};
