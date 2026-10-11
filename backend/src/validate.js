const { z } = require('zod');
const { STATUSES } = require('./workflow');

const priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const status = z.enum(STATUSES);

const isRealDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const taskBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional().default(''),
  priority: priority.default('MEDIUM'),
  due_date: z.string().refine(isRealDate, 'due_date must be a valid YYYY-MM-DD date'),
  assigned_to: z.number({ invalid_type_error: 'assigned_to must be a user id' }).int().positive(),
});

const taskFilters = z.object({
  status: status.optional(),
  priority: priority.optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
});

const transitionBody = z.object({
  action: z.enum(['start', 'submit', 'approve', 'reject']),
  note: z.string().trim().max(1000).optional(),
});

const commentBody = z.object({ body: z.string().trim().min(1, 'Comment cannot be empty').max(2000) });

const loginBody = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

const userBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(190),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
});

module.exports = { taskBody, taskFilters, transitionBody, commentBody, loginBody, userBody };
