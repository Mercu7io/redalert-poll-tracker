const { z } = require('zod');

const loginCheckSchema = z.object({
    password: z.string().min(1, 'Password is required')
});

const createPollSchema = z.object({
    groupId: z.string().min(3, 'Invalid group ID'),
    title: z.string().min(1, 'Poll title is required'),
    options: z.array(z.string().min(1, 'Option cannot be empty')).min(2, 'At least 2 options are required'),
    selectableCount: z.coerce.number().int().min(1).default(1)
});

const remindSchema = z.object({
    targetId: z.string().min(3, 'Invalid target WhatsApp ID'),
    customMessage: z.string().min(1, 'Reminder message cannot be empty')
});

const bulkRemindSchema = z.object({
    targetIds: z.array(z.string().min(3, 'Invalid target ID')).min(1, 'At least one recipient is required'),
    targets: z.array(z.object({
        id: z.string().min(3),
        name: z.string().optional().nullable()
    })).optional(),
    customMessage: z.string().min(1, 'Reminder message cannot be empty'),
    delayMs: z.coerce.number().int().min(500).max(10000).default(1500)
});

const groupParamSchema = z.object({
    groupId: z.string().min(3, 'Invalid group ID')
});

const pollStatsParamSchema = z.object({
    groupId: z.string().min(3, 'Invalid group ID'),
    pollId: z.string().min(3, 'Invalid poll ID')
});

const updateContactNameSchema = z.object({
    id: z.string().min(3, 'Invalid contact ID'),
    customName: z.string().trim().min(1, 'Name cannot be empty').max(100, 'Name cannot exceed 100 characters')
});

const updateContactCitySchema = z.object({
    id: z.string().min(3, 'Invalid contact ID'),
    cityId: z.coerce.string().optional().nullable(),
    cityName: z.string().optional().nullable(),
    cityNameEn: z.string().optional().nullable(),
    cityCountdown: z.coerce.number().optional().nullable()
});

const searchCitiesSchema = z.object({
    q: z.string().optional().default('')
});

module.exports = {
    loginCheckSchema,
    createPollSchema,
    remindSchema,
    bulkRemindSchema,
    groupParamSchema,
    pollStatsParamSchema,
    updateContactNameSchema,
    updateContactCitySchema,
    searchCitiesSchema
};

