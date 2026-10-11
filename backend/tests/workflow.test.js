const { checkTransition } = require('../src/workflow');

const emp = { id: 2, role: 'EMPLOYEE' };
const admin = { id: 1, role: 'ADMIN' };
const task = (status, assigned_to = 2) => ({ id: 9, status, assigned_to });

describe('workflow rules (pure unit tests)', () => {
  test('employee can start and submit own task', () => {
    expect(checkTransition('start', emp, task('PENDING'))).toBe('IN_PROGRESS');
    expect(checkTransition('submit', emp, task('IN_PROGRESS'))).toBe('PENDING_APPROVAL');
  });
  test('admin approve -> COMPLETED, reject -> IN_PROGRESS', () => {
    expect(checkTransition('approve', admin, task('PENDING_APPROVAL'))).toBe('COMPLETED');
    expect(checkTransition('reject', admin, task('PENDING_APPROVAL'))).toBe('IN_PROGRESS');
  });
  test('employee cannot approve or reject (403)', () => {
    expect(() => checkTransition('approve', emp, task('PENDING_APPROVAL'))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => checkTransition('reject', emp, task('PENDING_APPROVAL'))).toThrow(expect.objectContaining({ status: 403 }));
  });
  test('employee cannot touch someone else task (403)', () => {
    expect(() => checkTransition('start', emp, task('PENDING', 3))).toThrow(expect.objectContaining({ status: 403 }));
  });
  test('invalid state transitions are rejected (409)', () => {
    expect(() => checkTransition('submit', emp, task('PENDING'))).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => checkTransition('approve', admin, task('IN_PROGRESS'))).toThrow(expect.objectContaining({ status: 409 }));
  });
});
