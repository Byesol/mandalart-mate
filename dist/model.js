(function (root) {
  'use strict';

  const palettes = [
    ['#22362b', '#171e1b', '#29352f', '#99e0b1'],
    ['#332740', '#201b27', '#382e43', '#d2b0f6'],
    ['#24344a', '#191f2a', '#2c384a', '#a4c8ff'],
    ['#3b2936', '#251c23', '#3c303b', '#f3adc9'],
    ['#292533', '#1e1c23', '#36323e', '#d2bdff'],
    ['#393023', '#242019', '#3e362c', '#edc78b'],
    ['#203736', '#172221', '#2c3a39', '#8de0d5'],
    ['#36293c', '#241d28', '#3c3141', '#e9abe8'],
    ['#243643', '#1a222b', '#2d3a46', '#94d3f5']
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

  function nextGroupSlot(board, groupIndex) {
    const group = board.goals[groupIndex];
    if (!group.main.text) return groupIndex + ':main';
    const index = group.actions.findIndex(goal => !goal.text);
    return index >= 0 ? groupIndex + ':' + index : null;
  }

  const api = {palettes, groups, createBoard, emptyGoal, locate, boardCell, populatedGoals, progress, nextGroupSlot};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Mandalart = api;
})(globalThis);
