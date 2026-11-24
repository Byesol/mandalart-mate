(function (root) {
  'use strict';

  const palettes = [
    ['#e2ecd9', '#f1f6ed', '#e2eadf', '#a7c69e'],
    ['#f7ebd0', '#fbf6e9', '#f1e7d4', '#e2c47e'],
    ['#e3eaf7', '#f1f5fc', '#e0e7f1', '#aec2e5'],
    ['#eadff2', '#f6f0fa', '#ece3f0', '#c8add9'],
    ['#e3eddf', '#f3f7f1', '#dce7db', '#a0c19d'],
    ['#f5e2dd', '#fcf1ee', '#f0e3e0', '#dca697'],
    ['#dcece7', '#edf6f2', '#deebe6', '#9ebfb3'],
    ['#f4ecd6', '#faf6e9', '#efe9d9', '#dac497'],
    ['#e4e7f3', '#f1f3f9', '#e5e8f1', '#b0b7d6']
  ];
  const groups = [0, 1, 2, 3, 5, 6, 7, 8];
  const positions = [0, 1, 2, 3, 5, 6, 7, 8];
  const examples = [
    ['건강', '아침 스트레칭', '물 1.5L', '주 3회 운동', '점심 산책', '7시간 수면', '건강 검진'],
    ['성장', '월 2권 독서', '영어 10분', '강의 듣기', '독서 기록', '글 한 편 쓰기', '스터디 참여'],
    ['일과 커리어', '주간 회고', '업무 정리', '포트폴리오', '집중 시간', '멘토 찾기', '프로젝트 기록'],
    ['마음', '감사 일기', '알림 끄기', '10분 명상', '혼자 산책', '하루 돌아보기', '일찍 자기'],
    ['재정', '가계부 쓰기', '월 예산 세우기', '비상금 저축', '구독 정리', '소비 점검', '투자 공부'],
    ['관계', '부모님 연락', '친구 약속', '먼저 인사', '생일 챙기기', '함께 식사', '고마움 전하기'],
    ['취미', '사진 한 장', '새 요리', '전시 보기', '음악 듣기', '주말 산책', '그림 그리기'],
    ['여행', '여행지 고르기', '경비 모으기', '동네 탐방', '주말 기차여행', '지도에 표시', '기록 남기기']
  ];
  const exampleDone = new Set([0, 4, 8, 11, 16, 24, 26, 32, 36, 41, 48, 56, 57]);

  function emptyGoal(text = '') { return {text, doneAt: null, photo: null}; }

  function createBoard(sample = false) {
    return {
      version: 1,
      sample,
      core: emptyGoal(sample ? '올해 더 나은 나' : ''),
      goals: groups.map((block, groupIndex) => ({
        block,
        main: emptyGoal(sample ? examples[groupIndex][0] : ''),
        actions: positions.map((position, index) => {
          const goal = emptyGoal(sample ? examples[groupIndex][index + 1] ?? '' : '');
          const sequence = groupIndex * 8 + index;
          if (sample && goal.text && exampleDone.has(sequence)) {
            goal.doneAt = new Date(Date.UTC(2026, 0, 4, 0, sequence)).toISOString();
          }
          return goal;
        })
      }))
    };
  }

  function locate(board, id) {
    if (id === 'core') return {goal: board.core, kind: 'core', groupIndex: null, id};
    const match = /^([0-7]):(main|[0-7])$/.exec(id);
    if (!match) return null;
    const groupIndex = Number(match[1]);
    const item = match[2];
    const group = board.goals[groupIndex];
    if (item === 'main') return {goal: group.main, kind: 'goal', groupIndex, id};
    return {goal: group.actions[Number(item)], kind: 'action', groupIndex, id};
  }

  function boardCell(board, block, position) {
    if (block === 4 && position === 4) return locate(board, 'core');
    if (block === 4) return locate(board, groups.indexOf(position) + ':main');
    const groupIndex = groups.indexOf(block);
    const item = position === 4 ? 'main' : positions.indexOf(position);
    return locate(board, groupIndex + ':' + item);
  }

  function actionEntries(board) {
    return board.goals.flatMap((group, groupIndex) => group.actions.map((goal, index) => locate(board, groupIndex + ':' + index)));
  }

  function populatedGoals(board) {
    return [locate(board, 'core'), ...board.goals.flatMap((group, index) => [
      locate(board, index + ':main'),
      ...group.actions.map((goal, actionIndex) => locate(board, index + ':' + actionIndex))
    ])].filter(entry => entry.goal.text);
  }

  function progress(board) {
    const actions = actionEntries(board).filter(entry => entry.goal.text);
    const completed = populatedGoals(board)
      .filter(entry => entry.goal.doneAt)
      .sort((a, b) => Date.parse(b.goal.doneAt) - Date.parse(a.goal.doneAt));
    const done = actions.filter(entry => entry.goal.doneAt).length;
    const total = actions.length;
    return {total, done, completed, percent: total ? Math.round((done / total) * 100) : 0};
  }

  function nextSlot(board, currentGroup) {
    if (!board.core.text) return 'core';
    if (currentGroup !== null) {
      if (!board.goals[currentGroup].main.text) return currentGroup + ':main';
      const index = board.goals[currentGroup].actions.findIndex(goal => !goal.text);
      if (index >= 0) return currentGroup + ':' + index;
    }
    const groupIndex = board.goals.findIndex(group => !group.main.text);
    if (groupIndex >= 0) return groupIndex + ':main';
    return actionEntries(board).find(entry => !entry.goal.text)?.id ?? null;
  }

  const api = {palettes, groups, createBoard, emptyGoal, locate, boardCell, populatedGoals, progress, nextSlot};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Mandalart = api;
})(globalThis);
