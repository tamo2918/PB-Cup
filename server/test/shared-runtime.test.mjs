import assert from 'node:assert/strict';
import test from 'node:test';
import { KINDAI_STUDENT_COUNCIL_TEAMS, TEAM_NAME_MAX_LENGTH } from '@husen/shared';

test('shared runtime exports are available to plain Node', () => {
  assert.equal(KINDAI_STUDENT_COUNCIL_TEAMS.length, 20);
  assert.ok(KINDAI_STUDENT_COUNCIL_TEAMS.every((name) => name.length <= TEAM_NAME_MAX_LENGTH));
});
