import assert from 'node:assert/strict';
import test from 'node:test';
import { QUESTION_TIME_LIMIT_MS } from '@husen/shared';
import {
  closeAnsweringIfExpired,
  createRoom,
  deleteRoom,
  finalizeAnswer,
  joinTeam,
  nextQuestion,
  revealAnswer,
  scheduleAnswerDeadline,
  scheduleAnswerFinalization,
  startAnswering,
  startGame,
  submitAnswer,
  updateAnswer,
} from '../dist/rooms.js';

function createPreparedRoom() {
  const room = createRoom({
    questions: [
      { text: 'Question 1', correctAnswer: 28 },
      { text: 'Question 2', correctAnswer: 45 },
    ],
    startBalloons: 100,
    allowedTeams: ['Team A', 'Team B'],
  });
  assert.equal(joinTeam(room, 'Team A', 'socket-a').ok, true);
  assert.equal(joinTeam(room, 'Team B', 'socket-b').ok, true);
  assert.equal(startGame(room).ok, true);
  return room;
}

function createStartedRoom() {
  const room = createPreparedRoom();
  assert.equal(startAnswering(room).ok, true);
  return room;
}

test('a question waits for the admin before starting the timer', () => {
  const room = createPreparedRoom();
  try {
    assert.equal(room.phase, 'reading');
    assert.equal(room.questionStartedAt, undefined);
    assert.equal(room.answerDeadline, undefined);
    assert.deepEqual(submitAnswer(room, 'Team A', 28), {
      ok: false,
      error: '現在は回答受付中ではありません',
    });

    assert.equal(startAnswering(room).ok, true);
    assert.equal(room.phase, 'answering');
    assert.equal(room.answerDeadline - room.questionStartedAt, QUESTION_TIME_LIMIT_MS);
  } finally {
    deleteRoom(room.roomId);
  }
});

test('a question starts with a synchronized ten-second deadline', () => {
  const room = createStartedRoom();
  try {
    assert.equal(room.phase, 'answering');
    assert.equal(room.answerDeadline - room.questionStartedAt, QUESTION_TIME_LIMIT_MS);
  } finally {
    deleteRoom(room.roomId);
  }
});

test('deadline closes answers without advancing to the next question', async () => {
  const room = createStartedRoom();
  try {
    room.answerDeadline = Date.now() + 10;
    await new Promise((resolve) => scheduleAnswerDeadline(room, resolve));

    assert.equal(room.phase, 'waiting');
    assert.equal(room.questionIndex, 0);
    assert.deepEqual(submitAnswer(room, 'Team A', 28), {
      ok: false,
      error: '現在は回答受付中ではありません',
    });
  } finally {
    deleteRoom(room.roomId);
  }
});

test('an answer at or after the deadline is rejected immediately', () => {
  const room = createStartedRoom();
  try {
    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    assert.equal(room.phase, 'waiting');
    assert.equal(room.questionIndex, 0);
  } finally {
    deleteRoom(room.roomId);
  }
});

test('the latest input is scored without ending the timer early', () => {
  const room = createStartedRoom();
  try {
    assert.equal(updateAnswer(room, 'Team A', 20).ok, true);
    assert.equal(updateAnswer(room, 'Team A', 28).ok, true);
    assert.equal(updateAnswer(room, 'Team B', 30).ok, true);
    assert.equal(room.phase, 'answering');

    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    const reveal = revealAnswer(room);
    assert.equal(reveal.ok, true);
    assert.deepEqual(
      reveal.payload.results.map(({ teamName, answer, perfect }) => ({ teamName, answer, perfect })),
      [
        { teamName: 'Team A', answer: 28, perfect: true },
        { teamName: 'Team B', answer: 30, perfect: false },
      ]
    );
  } finally {
    deleteRoom(room.roomId);
  }
});

test('clearing the input leaves the team unanswered', () => {
  const room = createStartedRoom();
  try {
    assert.equal(updateAnswer(room, 'Team A', 28).ok, true);
    assert.equal(updateAnswer(room, 'Team A', null).ok, true);
    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    const reveal = revealAnswer(room);
    const teamAResult = reveal.payload.results.find((result) => result.teamName === 'Team A');
    assert.equal(teamAResult.answer, -1);
  } finally {
    deleteRoom(room.roomId);
  }
});

test('the reveal-time sync can replace the last server value', () => {
  const room = createStartedRoom();
  try {
    assert.equal(updateAnswer(room, 'Team A', 20).ok, true);
    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    assert.equal(finalizeAnswer(room, 'Team A', room.questionIndex, 28).ok, true);

    const reveal = revealAnswer(room);
    const teamAResult = reveal.payload.results.find((result) => result.teamName === 'Team A');
    assert.equal(teamAResult.answer, 28);
    assert.equal(teamAResult.perfect, true);
  } finally {
    deleteRoom(room.roomId);
  }
});

test('answer finalization waits briefly and cannot be scheduled twice', async () => {
  const room = createStartedRoom();
  try {
    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    let readyCount = 0;
    const ready = new Promise((resolve) => {
      assert.equal(
        scheduleAnswerFinalization(
          room,
          () => {
            readyCount += 1;
            resolve();
          },
          5
        ).ok,
        true
      );
    });
    assert.deepEqual(scheduleAnswerFinalization(room, () => {}), {
      ok: false,
      error: '最終回答を取得中です',
    });

    await ready;
    assert.equal(readyCount, 1);
    assert.equal(room.phase, 'waiting');
  } finally {
    deleteRoom(room.roomId);
  }
});

test('the next question returns to reading without starting a deadline', () => {
  const room = createStartedRoom();
  try {
    assert.equal(updateAnswer(room, 'Team A', 28).ok, true);
    assert.equal(updateAnswer(room, 'Team B', 28).ok, true);
    assert.equal(closeAnsweringIfExpired(room, room.answerDeadline), true);
    assert.equal(revealAnswer(room).ok, true);
    assert.equal(nextQuestion(room).ok, true);

    assert.equal(room.phase, 'reading');
    assert.equal(room.questionIndex, 1);
    assert.equal(room.questionStartedAt, undefined);
    assert.equal(room.answerDeadline, undefined);
  } finally {
    deleteRoom(room.roomId);
  }
});
