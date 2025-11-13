const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getTournamentStatus,
  startVoting,
  endVoting
} = require('../controllers/tournamentVotingController');

// Get tournament status (for console)
router.get('/:sessionId/status', authenticate, getTournamentStatus);

// Start voting for a round
router.post('/:sessionId/voting/start', authenticate, startVoting);

// End voting and advance winners
router.post('/:sessionId/voting/end', authenticate, endVoting);

module.exports = router;
