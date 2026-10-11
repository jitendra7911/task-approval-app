const { HttpError } = require('./errors');

const STATUSES = ['PENDING', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED'];

// action -> who may perform it, from which status, to which status
const TRANSITIONS = {
  start:   { role: 'EMPLOYEE', from: 'PENDING',          to: 'IN_PROGRESS' },
  submit:  { role: 'EMPLOYEE', from: 'IN_PROGRESS',      to: 'PENDING_APPROVAL' },
  approve: { role: 'ADMIN',    from: 'PENDING_APPROVAL', to: 'COMPLETED' },
  reject:  { role: 'ADMIN',    from: 'PENDING_APPROVAL', to: 'IN_PROGRESS' },
};

/** Validates a transition and returns the new status, or throws HttpError. */
function checkTransition(action, user, task) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new HttpError(400, `Unknown action "${action}"`);
  if (user.role !== rule.role) {
    throw new HttpError(403, `Only ${rule.role.toLowerCase()}s can ${action} a task`);
  }
  if (user.role === 'EMPLOYEE' && task.assigned_to !== user.id) {
    throw new HttpError(403, 'You can only update tasks assigned to you');
  }
  if (task.status !== rule.from) {
    throw new HttpError(409, `Cannot ${action} a task that is ${task.status}; it must be ${rule.from}`);
  }
  return rule.to;
}

module.exports = { STATUSES, TRANSITIONS, checkTransition };
