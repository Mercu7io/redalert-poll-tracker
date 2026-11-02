const express = require('express');
const { validate } = require('../middlewares/validate');
const { httpAuthMiddleware } = require('../middlewares/auth');
const authController = require('../controllers/authController');
const whatsappController = require('../controllers/whatsappController');
const pollController = require('../controllers/pollController');
const contactController = require('../controllers/contactController');
const {
    loginCheckSchema,
    createPollSchema,
    remindSchema,
    bulkRemindSchema,
    groupParamSchema,
    pollStatsParamSchema,
    updateContactNameSchema
} = require('../validators/schemas');

const router = express.Router();

// Public auth check
router.post(
    '/login-check',
    validate({ body: loginCheckSchema }),
    authController.loginCheck
);

// Protected routes
router.use(httpAuthMiddleware);

// WhatsApp Status & Control
router.get('/status', whatsappController.getStatus);
router.post('/whatsapp/disconnect', whatsappController.disconnect);
router.get('/groups', whatsappController.getGroups);
router.post(
    '/sync-history/:groupId/:pollId?',
    validate({ params: groupParamSchema }),
    whatsappController.syncHistory
);

// Polls
router.post(
    '/polls/create',
    validate({ body: createPollSchema }),
    pollController.createPoll
);

router.get(
    '/polls/:groupId',
    validate({ params: groupParamSchema }),
    pollController.getPollsByGroup
);

router.get(
    '/poll-stats/:groupId/:pollId',
    validate({ params: pollStatsParamSchema }),
    pollController.getPollStats
);

router.get(
    '/export/:groupId/:pollId',
    validate({ params: pollStatsParamSchema }),
    pollController.exportPollCsv
);

// Reminders
router.post(
    '/remind',
    validate({ body: remindSchema }),
    pollController.sendReminder
);

router.post(
    '/remind-bulk',
    validate({ body: bulkRemindSchema }),
    pollController.sendBulkReminders
);

// Contacts
router.post(
    '/contacts/update-name',
    validate({ body: updateContactNameSchema }),
    contactController.updateContactName
);

module.exports = router;

