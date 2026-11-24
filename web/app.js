(function () {
  'use strict';

  const model = window.Mandalart;
  const $ = id => document.getElementById(id);
  const dialog = $('dialog');
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6 5.4-5.4"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.5 6.6-4m-6.6 7 6.6 4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.3"/><path d="m4 17 4.5-4 3 2.5 3.5-4 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    edit: '<path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h.01M7 15h.01M10 9h7m-7 6h7"/>',
    pulse: '<path d="M3 12h4l3-6 4 12 3-6h4"/>',
    growth: '<path d="M5 19V6m0 13h14M8 15l4-4 3 1 4-5"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18m-11 0v2h4v-2"/>',
    heart: '<path d="M20.4 8.5c0 4.3-8.4 9.8-8.4 9.8s-8.4-5.5-8.4-9.8a4.4 4.4 0 0 1 8.4-1.7 4.4 4.4 0 0 1 8.4 1.7Z"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18m-5 5h2"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-14a3 3 0 0 1 0 6m2 2a4 4 0 0 1 3 4v2"/>',
    spark: '<path d="M12 3c0 5-2 7-7 7 5 0 7 2 7 7 0-5 2-7 7-7-5 0-7-2-7-7Zm-7 12v4m-2-2h4m12-2v4m-2-2h4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5 5-2.2Z"/>',
    download: '<path d="M12 4v11m-4-4 4 4 4-4M5 17v3h14v-3"/>'
  };
  const navigation = [
    ['board', 'grid', '홈'],
    ['areas', 'list', '목표 영역'],
    ['mates', 'people', '메이트'],
    ['completed', 'checkCircle', '완료 기록']
  ];

  let board = model.createBoard(true);
  let view = 'board';
  let activeGroup = null;
  let homeMate = '';
  let matePreview = null;
  let mateError = '';
  let homeRequest = 0;
  let toastTimer;
  let dbPromise;
  let loading = true;
  let prepared = null;
  let previewUrl = null;
  let savePending = false;
  const localKey = 'mandalart-mate-board-v1';

  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
  }

  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(localKey, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('boards');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
    return dbPromise;
  }

  async function loadBoard() {
    const database = await db();
    if (!database) {
      const data = localStorage.getItem(localKey);
      return data ? JSON.parse(data) : null;
    }
    return new Promise((resolve, reject) => {
      const request = database.transaction('boards').objectStore('boards').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function persist(nextBoard) {
    const database = await db();
    if (!database) {
      localStorage.setItem(localKey, JSON.stringify(nextBoard));
      return;
    }
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('boards', 'readwrite');
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('boards').put(nextBoard, 'current');
    });
  }

  async function update(change) {
    const nextBoard = JSON.parse(JSON.stringify(board));
    change(nextBoard);
    await persist(nextBoard);
    const previous = board;
    board = nextBoard;
    window.Mates.changed(previous, board);
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
  }

  function groupLabel(index, source = board) {
    return source.goals[index].main.text || '영역 ' + (index + 1);
  }

  function entryLabel(entry, source = board) {
    if (entry.kind === 'core') return '중심 목표';
    if (entry.kind === 'goal') return '영역 목표';
    return groupLabel(entry.groupIndex, source);
  }

  const areaIcons = ['pulse', 'growth', 'work', 'heart', 'wallet', 'people', 'spark', 'compass'];
  const completedDate = new Intl.DateTimeFormat('ko-KR', {year: 'numeric', month: 'long', day: 'numeric'});

  function navMarkup() {
    return navigation.map(([id, symbol, label]) => {
      const action = 'data-view="' + id + '"';
      const current = id === view ? ' aria-current="page"' : '';
      return '<button type="button" class="nav-button" ' + action + current + '><span class="nav-icon">' + icon(symbol) + '</span><span>' + label + '</span></button>';
    }).join('') + '<button type="button" class="nav-button nav-add" data-action="new"><span class="nav-icon">' +
      icon('plus') + '</span><span>새 목표</span></button>';
  }

  function areaStyle(index) {
    const colors = model.palettes[model.groups[index]];
    return ' style="--tile:' + colors[0] + ';--area:' + colors[3] + '"';
  }

  function areaIcon(index) {
    return '<span class="area-icon">' + icon(board.sample ? areaIcons[index] : 'grid') + '</span>';
  }

  function areaProgress(group) {
    const total = group.actions.filter(model.filled).length;
    const done = group.actions.filter(goal => model.filled(goal) && goal.doneAt).length;
    const label = total ? done + ' / ' + total + '개 완료' : '실행 목표 없음';
    const meter = '<span class="area-meter" aria-hidden="true">' + group.actions.map((_, index) => {
      const state = index < done ? ' class="done"' : index < total ? ' class="pending"' : '';
      return '<i' + state + '></i>';
    }).join('') + '</span>';
    return {label, meter};
  }

  function renderAreas() {
    const cards = board.goals.map((group, index) => {
      const progress = areaProgress(group);
      return '<button type="button" class="area-card" data-open-area="' + index + '"' + areaStyle(index) + '>' +
        '<span class="area-card-head">' + areaIcon(index) + '<span class="area-copy"><strong>' + escape(groupLabel(index)) +
        '</strong><small>' + progress.label + '</small></span></span>' + progress.meter + '</button>';
    }).join('');
    const sample = board.sample ? '<button type="button" class="text-button sample-chip" data-action="blank">예시 비우고 시작</button>' : '';
    return '<section class="areas-page" aria-labelledby="areas-title"><div class="page-heading">' +
      '<div><h1 id="areas-title">목표 영역</h1><p>실행 목표를 관리할 영역을 고르세요.</p></div></div>' +
      '<div class="area-cards-heading"><span>8개 영역</span>' + sample + '</div>' +
      '<div class="area-grid">' + cards + '</div></section>';
  }

  function renderMission(stats) {
    const title = model.goalTitle(board.core) || '중심 목표 추가';
    return '<section class="board-lead"><div><h1>내 만다라트</h1><button class="board-core" type="button" data-edit="core">' +
      icon('target') + '<span>' + escape(title) + '</span>' + icon(board.core.text ? 'edit' : 'plus') + '</button></div>' +
      '<div class="board-progress"><strong>' + stats.percent + '%</strong><progress max="100" value="' + stats.percent +
      '" aria-label="실행 목표 진행률"></progress><small>' + stats.done + ' / ' + stats.total + ' 완료</small></div></section>';
  }

  function renderGridBlock(block, source = board, readonly = false) {
    const colors = model.palettes[block];
    const cells = Array.from({length: 9}, (_, position) => {
      const entry = model.boardCell(source, block, position);
      const goal = entry.goal;
      const mirrored = block === 4 && position !== 4 ? model.palettes[position] : null;
      const accent = mirrored ? ' style="--block:' + mirrored[0] + ';--area:' + mirrored[3] + '"' : '';
      const cellType = entry.kind === 'action' ? '' : ' ' + entry.kind;
      const name = entry.kind === 'action' ? entryLabel(entry, source) + ' 실행 목표' : entryLabel(entry, source);
      const filled = model.filled(goal);
      const label = name + (filled ? ' · ' + model.goalTitle(goal) : ' 추가') + (goal.photo ? ' · 사진 첨부' : '') +
        (goal.doneAt ? ' · 완료' : '');
      const mark = goal.doneAt ? '<span class="cell-mark">' + icon('check') + '</span>' : '';
      const photo = goal.photo ? '<img class="cell-photo" src="' + escape(goal.photo) + '" alt="">' : '';
      const caption = goal.text ? '<span class="cell-text">' + escape(goal.text) + '</span>' : '';
      const className = 'cell' + cellType + (goal.doneAt ? ' done' : '') + (filled ? '' : ' empty') +
        (goal.photo ? ' photographed' : '');
      if (readonly && !filled) return '<div class="' + className + ' unshared" aria-hidden="true"></div>';
      const attribute = readonly ? 'data-mate-goal' : 'data-edit';
      return '<button type="button" class="' + className + '" ' + attribute + '="' + entry.id +
        '" aria-label="' + escape(label) + '"' + accent + '>' + (filled ? photo + caption : icon('plus')) + mark + '</button>';
    }).join('');
    return '<div class="block" style="--block:' + colors[0] + ';--cell:' + colors[1] +
      ';--block-line:' + colors[2] + ';--area:' + colors[3] + '" role="group" aria-label="' +
      escape(block === 4 ? '중심 목표와 영역 목표' : groupLabel(model.groups.indexOf(block), source)) + '">' + cells + '</div>';
  }

  function renderGrid(source = board, readonly = false) {
    const blocks = Array.from({length: 9}, (_, block) => renderGridBlock(block, source, readonly)).join('');
    return '<section class="panel grid-panel" aria-label="9×9 만다라트 목표판">' +
      '<div class="board-scroll"><div class="board">' + blocks + '</div></div>' +
      '</section>';
  }

  function homeRail() {
    const tones = ['#fcf5dd', '#e1fb78', '#ffdb78', '#bce4fd', '#ffd0bd'];
    const members = window.Mates.homeMembers();
    const chips = members.map((mate, index) => {
      const initial = Array.from(mate.name.trim())[0] || 'M';
      return '<button class="home-avatar-button" type="button" data-home-mate="' + escape(mate.code) +
        '" aria-pressed="' + (homeMate === mate.code) + '"><span class="home-avatar" style="--avatar-tone:' +
        tones[(index + 1) % tones.length] + '">' + escape(initial) + '</span><span class="home-avatar-name">' +
        escape(mate.name) + '</span>' + (mate.sample ? '<small>예시</small>' : '') + '</button>';
    }).join('');
    return '<div class="home-avatars"><button class="home-avatar-button" type="button" data-view="board" aria-pressed="' +
      !homeMate + '"><span class="home-avatar home-self">' + icon('grid') + '</span><span class="home-avatar-name">내 목표판</span></button>' +
      chips + '<button class="home-avatar-button" type="button" data-view="mates"><span class="home-avatar home-add">' +
      icon('plus') + '</span><span class="home-avatar-name">메이트 추가</span></button></div>';
  }

  function toMateBoard(preview) {
    const result = model.createBoard();
    for (const post of preview.posts) {
      const entry = model.locate(result, post.id);
      if (!entry) continue;
      Object.assign(entry.goal, {text: post.title, doneAt: post.doneAt || null, photo: post.photo || null});
    }
    return result;
  }

  function homePanel() {
    if (!homeMate) {
      return renderMission(model.progress(board)) + renderGrid() +
        '<p class="board-hint">칸을 눌러 목표와 사진을 넣으세요.</p>';
    }
    if (mateError) {
      return '<div class="panel"><p class="empty-note">' + escape(mateError) + '</p>' +
        '<button type="button" class="button secondary" data-action="refresh-mate">다시 불러오기</button></div>';
    }
    const known = window.Mates.homeMembers().find(mate => mate.code === homeMate);
    const preview = matePreview ?? window.Mates.sampleBoard(homeMate);
    const name = preview?.name ?? known?.name ?? '메이트';
    return '<div class="page-heading friend-heading"><div><h1>' + escape(name) + '님의 만다라트</h1><p>' +
      (preview?.sample ? '예시 목표판' : preview ? '나에게 공개한 목표 ' + preview.posts.length + '개' : '목표를 불러오는 중이에요.') +
      '</p></div></div>' + (preview ? renderGrid(toMateBoard(preview), true) : '');
  }

  async function refreshHome() {
    const request = ++homeRequest;
    const key = homeMate;
    window.Mates.refreshHome().then(() => {
      if (view === 'board' && request === homeRequest) $('home-mates').innerHTML = homeRail();
    });
    if (!key || window.Mates.sampleBoard(key)) return;
    try {
      const next = await window.Mates.boardFor(key);
      if (request !== homeRequest || view !== 'board') return;
      matePreview = next;
      mateError = '';
    } catch (reason) {
      if (request !== homeRequest || view !== 'board') return;
      matePreview = null;
      mateError = reason.message;
    }
    $('home-board').innerHTML = homePanel();
  }

  function openMateGoal(id) {
    const preview = matePreview ?? window.Mates.sampleBoard(homeMate);
    const post = preview?.posts.find(item => item.id === id);
    if (!post) return;
    const state = post.doneAt ? '완료' : '진행 중';
    const photo = post.photo ? '<div class="proof"><img src="' + escape(post.photo) + '" alt="' + escape(post.title) +
      ' 사진"></div>' : '';
    showDialog(post.title, [preview.name, post.area, state].filter(Boolean).join(' · '), photo);
  }

  function taskRow(goal, groupIndex, index) {
    const id = groupIndex + ':' + index;
    const done = Boolean(goal.doneAt);
    const label = escape(model.goalTitle(goal));
    const photo = goal.photo ? '<img src="' + escape(goal.photo) + '" alt="" loading="lazy">' : icon('image');
    const photoButton = '<button type="button" class="icon-button task-extra' + (goal.photo ? ' has-photo' : '') +
      '" data-photo="' + id + '" aria-label="' + label + (goal.photo ? ' 사진 보기' : ' 사진 추가') + '">' + photo + '</button>';
    return '<div class="task-row' + (done ? ' done' : '') + '"><button type="button" class="task-check" data-complete="' +
      id + '" aria-pressed="' + done + '" aria-label="' + label + ' 완료"><i>' + (done ? icon('check') : '') + '</i></button>' +
      '<button type="button" class="task-name" data-edit="' + id + '">' + label + '</button>' + photoButton + '</div>';
  }

  function renderArea(index) {
    const group = board.goals[index];
    const title = groupLabel(index);
    const progress = areaProgress(group);
    const tasks = group.actions.map((goal, actionIndex) => model.filled(goal) ? taskRow(goal, index, actionIndex) : '').join('');
    return '<button type="button" class="button secondary back-area" data-action="areas">' + icon('list') + '목표 영역</button>' +
      '<section class="panel area-summary"' + areaStyle(index) + '><div class="area-header">' + areaIcon(index) +
      '<div><h1>' + escape(title) + '</h1><p>' + progress.label + '</p></div>' +
      '<button type="button" class="icon-button" data-edit="' + index + ':main" aria-label="영역 목표 편집">' +
      icon(group.main.text ? 'edit' : 'plus') + '</button></div>' + progress.meter + '</section>' +
      '<section aria-labelledby="tasks-title"' + areaStyle(index) + '><div class="section-heading"><h2 id="tasks-title">실행 목표</h2></div>' +
      (tasks ? '<div class="task-list">' + tasks + '</div>' : '<p class="panel empty-note">아직 실행 목표가 없어요.</p>') + '</section>' +
      '<details class="area-board" data-area="' + index + '"><summary>' + icon('grid') + '3×3으로 보기</summary>' +
      renderGridBlock(group.block) + '</details>';
  }

  function recentRow(entry) {
    const photo = entry.goal.photo ? '<img src="' + escape(entry.goal.photo) + '" alt="완료 인증 사진" loading="lazy">' : '';
    const accent = entry.groupIndex === null ? model.palettes[4][3] : model.palettes[model.groups[entry.groupIndex]][3];
    return '<button type="button" class="recent-row" data-edit="' + entry.id + '"><span class="recent-check" style="--area:' +
      accent + '">' + icon('check') + '</span><span class="recent-copy"><strong>' + escape(model.goalTitle(entry.goal)) +
      '</strong><small>' + escape(entryLabel(entry)) + '</small></span>' + photo + '</button>';
  }

  function renderCompleted(entries) {
    const days = new Map();
    for (const entry of entries) {
      const key = completedDate.format(new Date(entry.goal.doneAt));
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(entry);
    }
    const lists = Array.from(days, ([date, items]) =>
      '<section class="completed-day"><h2>' + escape(date) + '</h2><div class="completed-list">' +
      items.map(recentRow).join('') + '</div></section>').join('');
    return '<div class="completed-header"><h1>완료 기록</h1><p>' + entries.length + '개 완료</p></div>' +
      (lists || '<section class="panel"><p class="empty-note">아직 완료한 목표가 없어요.</p></section>');
  }

  function render() {
    const stats = model.progress(board);
    const nav = navMarkup();
    document.querySelector('[data-action="images"]').hidden = view === 'board' && !!homeMate;
    $('desktop-nav').innerHTML = nav;
    $('mobile-nav').innerHTML = nav;
    if (view === 'mates') {
      $('main-view').innerHTML = window.Mates.render();
      return;
    }
    if (view === 'completed') {
      $('main-view').innerHTML = renderCompleted(stats.completed);
      return;
    }
    const main = $('main-view');
    if (view === 'board') {
      main.innerHTML = '<nav id="home-mates" aria-label="홈의 메이트">' + homeRail() +
        '</nav><div id="home-board">' + homePanel() + '</div>';
      return;
    }
    const wasExpanded = main.querySelector('.area-board[data-area="' + activeGroup + '"]')?.open;
    main.innerHTML = activeGroup === null ? renderAreas() : renderArea(activeGroup);
    if (wasExpanded) main.querySelector('.area-board').open = true;
  }

  function showDialog(title, subtitle, content) {
    $('dialog-body').innerHTML = '<div class="dialog-head"><div><h2 id="dialog-title">' + escape(title) +
      '</h2>' + (subtitle ? '<p>' + escape(subtitle) + '</p>' : '') + '</div>' +
      '<button type="button" class="icon-button" data-action="close" aria-label="닫기">' + icon('x') + '</button></div>' + content;
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog() {
    if (!savePending) dialog.close();
  }

  function actionButton(action, label, variant = 'secondary') {
    return '<button type="button" class="button ' + variant + '" data-action="' + action + '">' + label + '</button>';
  }

  function dialogActions(buttons) { return '<div class="dialog-actions">' + buttons + '</div>'; }

  function openEditor(id, {focusPhoto = false, navigateTo = null} = {}) {
    const entry = model.locate(board, id);
    if (!entry) return;
    const goal = entry.goal;
    const type = entry.kind === 'core' ? '중심 목표' : entry.kind === 'goal' ? '영역 목표' : '실행 목표';
    showDialog(type + (model.filled(goal) ? ' 편집' : ' 추가'), entry.kind === 'action' ? entryLabel(entry) : '',
      '<form id="goal-form"><label class="field">목표 이름<input name="text" maxlength="48" placeholder="목표 또는 사진 제목" value="' +
      escape(goal.text) + '"></label>' +
      '<label class="check-line"><input name="done" type="checkbox"' + (goal.doneAt ? ' checked' : '') + '> 완료했어요</label>' +
      '<div class="proof" id="proof"><label class="field">사진<input name="image" type="file" accept="image/*"></label>' +
      '<div id="proof-preview"></div>' + actionButton('remove-photo', '사진 제거') +
      '<p class="dialog-copy">사진을 넣으면 목표판 칸에 바로 보여요.</p></div>' +
      '<p class="form-error" id="form-error" role="alert"></p>' +
      dialogActions((model.filled(goal) ? actionButton('delete-goal', '목표 삭제', 'secondary danger') : '') +
        actionButton('close', '취소') + '<button type="submit" class="button primary">저장</button>') + '</form>');
    const form = $('goal-form');
    form.elements[focusPhoto ? 'image' : 'text'].focus({preventScroll: true});
    const remove = form.querySelector('[data-action="remove-photo"]');
    let photo = goal.photo;
    let photoTask = null;

    function syncPhoto() {
      $('proof-preview').innerHTML = photo ? '<img src="' + escape(photo) + '" alt="인증 사진 미리보기">' : '';
      remove.hidden = !photo;
    }
    syncPhoto();
    remove.addEventListener('click', () => {
      photo = null;
      form.elements.image.value = '';
      photoTask = null;
      syncPhoto();
    });
    form.elements.image.addEventListener('change', () => {
      const file = form.elements.image.files[0];
      if (!file) return;
      $('form-error').textContent = '';
      const task = compressPhoto(file);
      photoTask = task;
      task.then(result => {
        if (photoTask === task && form.isConnected) {
          photo = result;
          syncPhoto();
        }
      }).catch(() => {
        if (photoTask === task && form.isConnected) {
          form.elements.image.value = '';
          $('form-error').textContent = '사진을 열 수 없어요. JPG, PNG 또는 WebP 사진을 선택해 주세요.';
        }
      }).finally(() => {
        if (photoTask === task) photoTask = null;
      });
    });
    form.querySelector('[data-action="delete-goal"]')?.addEventListener('click', () => {
      confirmChange('이 목표를 지울까요?', '목표의 완료 기록과 인증 사진도 함께 삭제돼요.', async () => {
        await update(next => Object.assign(model.locate(next, id).goal, model.emptyGoal()));
        if (view === 'completed' && !model.progress(board).completed.length) view = 'board';
      }, '목표를 지웠어요.', '삭제', () => openEditor(id));
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (savePending) return;
      const input = form.elements.text;
      const text = input.value.trim();
      const done = form.elements.done.checked;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      savePending = true;
      try {
        if (photoTask) await photoTask;
        if (!text && !photo) {
          $('form-error').textContent = '목표 이름을 입력하거나 사진을 넣어 주세요.';
          input.focus();
          submit.disabled = false;
          return;
        }
        await update(next => Object.assign(model.locate(next, id).goal, {
          text, doneAt: done ? goal.doneAt || new Date().toISOString() : null, photo
        }));
        dialog.close();
        if (navigateTo === null) render();
        else switchView('areas', navigateTo);
        document.querySelector('[data-edit="' + id + '"]')?.focus({preventScroll: true});
        toast(done && !goal.doneAt ? '목표를 완료했어요!' : '목표를 저장했어요.');
      } catch {
        $('form-error').textContent = '저장하지 못했어요. 저장 공간과 사진 형식을 확인해 주세요.';
        submit.disabled = false;
      } finally {
        savePending = false;
      }
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function compressPhoto(file) {
    if (!file.type.startsWith('image/') && !/\.(jpg|jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.name)) throw new Error('Image required');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const photo = canvas.toDataURL('image/jpeg', .77);
      return photo.length <= 860_000 ? photo : canvas.toDataURL('image/jpeg', .59);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function confirmChange(title, copy, callback, message, label, cancel) {
    const cancelAction = cancel ? 'cancel-confirm' : 'close';
    showDialog(title, '', '<p class="dialog-copy">' + escape(copy) + '</p><p class="form-error" id="form-error" role="alert"></p>' +
      dialogActions(actionButton(cancelAction, '취소') + '<button type="button" id="confirm" class="button primary">' + label + '</button>'));
    if (cancel) dialog.querySelector('[data-action="cancel-confirm"]').addEventListener('click', cancel);
    $('confirm').addEventListener('click', async () => {
      if (savePending) return;
      savePending = true;
      $('confirm').disabled = true;
      try {
        await callback();
        dialog.close();
        render();
        toast(message);
      } catch {
        $('form-error').textContent = '변경사항을 저장하지 못했어요. 다시 시도해 주세요.';
        $('confirm').disabled = false;
      } finally {
        savePending = false;
      }
    });
  }

  function openShare(initialSelection = null, includePhotos = false) {
    clearPreview();
    const goals = model.populatedGoals(board);
    if (goals.length === 0) {
      showDialog('공유할 목표 고르기', '', '<p class="dialog-copy">목표판에 목표를 추가하면 친구에게 공유할 수 있어요.</p>' +
        dialogActions(actionButton('close', '닫기', 'primary')));
      return;
    }
    const sharingList = goals.map(entry =>
      '<label class="check-line share-option"><input type="checkbox" value="' + entry.id + '"' +
      (initialSelection?.has(entry.id) ? ' checked' : '') + '><span>' + escape(model.goalTitle(entry.goal)) + '</span><small>' +
      escape(entryLabel(entry)) + (entry.goal.doneAt ? ' · 완료' : '') + '</small></label>').join('');
    showDialog('공유할 목표 고르기', '선택한 목표만 공유 이미지에 담겨요.',
      '<div class="share-controls"><button type="button" class="text-button" id="select-all">전체 선택</button>' +
      '<button type="button" class="text-button" id="clear-all">선택 해제</button><span class="share-count" id="share-count" aria-live="polite"></span></div>' +
      '<div class="share-list" id="share-list">' + sharingList + '</div>' +
      '<label class="check-line"><input type="checkbox" id="include-photos"' + (includePhotos ? ' checked' : '') + '> 사진도 포함</label>' +
      '<p class="form-error" id="form-error" role="alert"></p>' +
      dialogActions(actionButton('close', '취소') + '<button type="button" id="prepare-share" class="button primary">공유 이미지 만들기</button>'));
    const list = $('share-list');
    const choices = Array.from(list.querySelectorAll('input'));
    const selected = () => new Set(choices.filter(choice => choice.checked).map(choice => choice.value));
    const prepare = $('prepare-share');
    function count() {
      const size = selected().size;
      $('share-count').textContent = size + '개 선택';
      prepare.disabled = size === 0;
    }
    list.addEventListener('change', count);
    $('select-all').onclick = () => { choices.forEach(choice => { choice.checked = true; }); count(); };
    $('clear-all').onclick = () => { choices.forEach(choice => { choice.checked = false; }); count(); };
    count();
    prepare.addEventListener('click', async () => {
      prepare.disabled = true;
      const selection = selected();
      const withPhotos = $('include-photos').checked;
      try {
        const entries = goals.filter(entry => selection.has(entry.id));
        const blob = await shareImage(entries, withPhotos);
        if (!dialog.open || !prepare.isConnected) return;
        prepared = {
          file: new File([blob], '만다라트-공유-목표.png', {type: 'image/png'}),
          text: entries.map(entry => (entry.goal.doneAt ? '✓ ' : '□ ') + model.goalTitle(entry.goal)).join('\n'),
          selection, withPhotos
        };
        previewUrl = URL.createObjectURL(blob);
        const canShare = canShareFile(prepared.file);
        showDialog('공유 이미지', '선택한 목표 ' + entries.length + '개',
          '<div class="proof"><img src="' + previewUrl + '" alt="선택한 목표의 공유 이미지"></div>' +
          (canShare ? '' : '<p class="dialog-copy">이미지를 저장해 메신저에서 친구에게 보낼 수 있어요.</p>') +
          '<p class="form-error" id="form-error" role="alert"></p>' +
          dialogActions(actionButton('share-back', '다시 고르기') + actionButton('copy', '텍스트 복사') +
            actionButton('save-share-image', '이미지 저장') + (canShare ? actionButton('send', '친구에게 보내기', 'primary') : '')));
      } catch {
        if (prepare.isConnected) {
          $('form-error').textContent = '공유 이미지를 만들지 못했어요. 다시 시도해 주세요.';
          prepare.disabled = false;
        }
      }
    });
  }

  function canvasFont(size, weight = 600) {
    return weight + ' ' + size + 'px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  }

  function rectangle(ctx, x, y, w, h, radius, color) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function writeLines(ctx, text, maxWidth, maxRows) {
    const rows = [];
    let row = '';
    for (const character of text) {
      if (row && ctx.measureText(row + character).width > maxWidth) {
        rows.push(row.trimEnd());
        row = character.trimStart();
      } else {
        row += character;
      }
    }
    if (row) rows.push(row.trimEnd());
    if (rows.length <= maxRows) return rows;
    const visible = rows.slice(0, maxRows);
    let last = visible[maxRows - 1];
    while (last.length && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    visible[maxRows - 1] = last + '…';
    return visible;
  }

  function toPng(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
  }

  async function boardImage() {
    const photos = new Map(await Promise.all(model.populatedGoals(board).filter(entry => entry.goal.photo)
      .map(async entry => [entry.id, await loadImage(entry.goal.photo)])));
    const canvas = document.createElement('canvas');
    canvas.width = 1260;
    canvas.height = 1360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = canvasFont(27, 750);
    ctx.fillStyle = '#d8ef96';
    ctx.fillText('만다라트 메이트', 60, 65);
    ctx.font = canvasFont(42, 850);
    ctx.fillStyle = '#f6f5f9';
    const headline = writeLines(ctx, board.core.text || '내 만다라트', 1140, 1)[0];
    ctx.fillText(headline, 60, 124);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let block = 0; block < 9; block++) {
      const colors = model.palettes[block];
      const x = 60 + (block % 3) * 384;
      const y = 160 + Math.floor(block / 3) * 384;
      rectangle(ctx, x, y, 372, 372, 13, colors[2]);
      for (let pos = 0; pos < 9; pos++) {
        const entry = model.boardCell(board, block, pos);
        const cx = x + 4 + (pos % 3) * 122;
        const cy = y + 4 + Math.floor(pos / 3) * 122;
        const isCore = entry.kind === 'core';
        const areaColors = block === 4 && pos !== 4 ? model.palettes[pos] : colors;
        const fill = isCore ? '#f6f4dd' : !model.filled(entry.goal) ? '#252528' : entry.kind === 'goal' ? areaColors[0] : colors[1];
        rectangle(ctx, cx, cy, 120, 120, 6, fill);
        const photo = photos.get(entry.id);
        if (photo) {
          const side = Math.min(photo.naturalWidth, photo.naturalHeight);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cx, cy, 120, 120, 6);
          ctx.clip();
          ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, cx, cy, 120, 120);
          if (entry.goal.text) rectangle(ctx, cx, cy + 83, 120, 37, 0, fill);
          ctx.restore();
        }
        if (entry.goal.doneAt) {
          rectangle(ctx, cx + 92, cy + 5, 22, 22, 5, '#d7ed85');
          ctx.font = canvasFont(16, 750);
          ctx.fillStyle = '#25291b';
          ctx.fillText('✓', cx + 103, cy + 16);
        }
        ctx.font = canvasFont(18, isCore ? 800 : 650);
        ctx.fillStyle = '#191b13';
        const lines = writeLines(ctx, entry.goal.text, 104, photo ? 1 : 4);
        lines.forEach((line, i) => ctx.fillText(line, cx + 60, cy + (photo ? 101 : 60) + (i - (lines.length - 1) / 2) * 20));
      }
    }
    return toPng(canvas);
  }

  async function shareImage(entries, withPhotos) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    ctx.font = canvasFont(24, 720);
    const items = entries.map(entry => {
      const hasPhoto = withPhotos && Boolean(entry.goal.photo);
      const lines = writeLines(ctx, model.goalTitle(entry.goal), hasPhoto ? 490 : 610, 4);
      return {entry, hasPhoto, lines, height: Math.max(hasPhoto ? 112 : 82, 53 + lines.length * 30)};
    });
    canvas.height = 158 + items.reduce((sum, item) => sum + item.height + 8, 0) + 22;
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d8ef96';
    ctx.font = canvasFont(22, 750);
    ctx.fillText('만다라트 메이트', 42, 52);
    ctx.font = canvasFont(38, 850);
    ctx.fillText('공유한 목표 · ' + entries.length + '개', 42, 106);
    let y = 138;
    for (const item of items) {
      rectangle(ctx, 40, y, 720, item.height, 12, '#202027');
      const done = item.entry.goal.doneAt;
      rectangle(ctx, 55, y + 18, 26, 26, 5, done ? '#d8ef96' : '#32313c');
      ctx.fillStyle = done ? '#232817' : '#d8ef96';
      ctx.font = canvasFont(17, 750);
      ctx.fillText(done ? '✓' : '○', 61, y + 37);
      ctx.fillStyle = '#f6f5f9';
      ctx.font = canvasFont(24, 720);
      item.lines.forEach((line, i) => ctx.fillText(line, 92, y + 36 + i * 30));
      ctx.fillStyle = '#aaa9b5';
      ctx.font = canvasFont(18);
      ctx.fillText(done ? '완료' : '진행 중', 92, y + 36 + item.lines.length * 30);
      if (item.hasPhoto) {
        const image = await loadImage(item.entry.goal.photo);
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 650, y + 15, 82, 82);
      }
      y += item.height + 8;
    }
    return toPng(canvas);
  }

  function canShareFile(file) {
    try {
      return Boolean(navigator.share && navigator.canShare?.({files: [file]}));
    } catch {
      return false;
    }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    prepared = null;
  }

  function copyShareText() {
    const value = prepared?.text;
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => toast('선택한 목표를 복사했어요.')).catch(() => manualCopy(value));
    } else {
      manualCopy(value);
    }
  }

  function manualCopy(value) {
    const error = $('form-error');
    if (!error) return;
    error.textContent = '아래 텍스트를 선택해 복사하세요.';
    let field = $('manual-copy');
    if (!field) {
      field = document.createElement('textarea');
      field.id = 'manual-copy';
      field.readOnly = true;
      field.rows = 3;
      field.setAttribute('aria-label', '공유할 목표 텍스트');
      const label = document.createElement('div');
      label.className = 'field';
      label.append(field);
      error.after(label);
    }
    field.value = value;
    field.focus();
    field.select();
  }

  function readScreen() {
    const fragment = location.hash;
    const area = /^#area-([1-8])$/.exec(fragment);
    const mate = /^#mate-([A-F0-9]{14}|demo-jiu|demo-seoyeon)$/.exec(fragment);
    const code = mate?.[1] ?? '';
    if (code !== homeMate) {
      matePreview = null;
      mateError = '';
    }
    homeMate = code;
    view = fragment === '#completed' ? 'completed' : fragment === '#mates' ? 'mates' :
      fragment === '#areas' || area ? 'areas' : 'board';
    activeGroup = area ? Number(area[1]) - 1 : null;
  }

  function showScreen() {
    readScreen();
    render();
    window.scrollTo(0, 0);
    $('main').focus({preventScroll: true});
    if (view === 'mates') window.Mates.open();
    if (view === 'board') refreshHome();
  }

  function goTo(fragment) {
    if ((location.hash || '#board') !== fragment) history.pushState({mandalartFrom: location.hash || '#board'}, '', fragment);
    showScreen();
  }

  function switchView(next, group = null) {
    goTo(group === null ? '#' + next : '#area-' + (group + 1));
  }

  function openAddPicker() {
    const options = board.goals.map((_, index) => {
      const id = model.nextGroupSlot(board, index);
      return '<button type="button" class="area-card add-option"' + (id ? ' data-add-to="' + id + '"' : ' disabled') +
        areaStyle(index) + '><span class="area-card-head">' + areaIcon(index) + '<span class="area-copy"><strong>' +
        escape(groupLabel(index)) + '</strong><small>' + (id ? (id.endsWith(':main') ? '영역 목표 추가' : '실행 목표 추가') : '모든 칸 사용 중') +
        '</small></span></span></button>';
    }).join('');
    showDialog('목표 추가', '목표를 넣을 영역을 고르세요.', '<div class="area-grid add-grid">' + options + '</div>');
  }

  function startAdd() {
    if (activeGroup !== null) {
      const id = model.nextGroupSlot(board, activeGroup);
      if (id) openEditor(id);
      else toast('이 영역의 실행 목표가 모두 채워졌어요.');
      return;
    }
    if (!model.filled(board.core)) {
      openEditor('core');
      return;
    }
    openAddPicker();
  }

  async function toggleCompletion(id) {
    const entry = model.locate(board, id);
    if (!entry || !model.filled(entry.goal)) return;
    savePending = true;
    const done = !entry.goal.doneAt;
    const control = document.querySelector('[data-complete="' + id + '"]');
    if (control) control.disabled = true;
    try {
      await update(next => { model.locate(next, id).goal.doneAt = done ? new Date().toISOString() : null; });
      render();
      document.querySelector('[data-complete="' + id + '"]')?.focus({preventScroll: true});
      toast(done ? '목표를 완료했어요!' : '완료 표시를 취소했어요.');
    } catch {
      if (control) control.disabled = false;
      toast('완료 상태를 저장하지 못했어요.');
    } finally {
      savePending = false;
    }
  }

  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-action], [data-view], [data-edit], [data-open-area], [data-complete], [data-photo], [data-add-to], [data-home-mate], [data-mate-goal]');
    if (!control || loading || savePending) return;
    if (control.dataset.view) {
      event.preventDefault();
      switchView(control.dataset.view);
      return;
    }
    if (control.dataset.homeMate) {
      goTo('#mate-' + control.dataset.homeMate);
      return;
    }
    if (control.dataset.mateGoal) {
      openMateGoal(control.dataset.mateGoal);
      return;
    }
    if (control.dataset.openArea !== undefined) {
      switchView('areas', Number(control.dataset.openArea));
      return;
    }
    if (control.dataset.edit) {
      openEditor(control.dataset.edit);
      return;
    }
    if (control.dataset.complete) {
      await toggleCompletion(control.dataset.complete);
      return;
    }
    if (control.dataset.photo) {
      openEditor(control.dataset.photo, {focusPhoto: true});
      return;
    }
    if (control.dataset.addTo) {
      const entry = model.locate(board, control.dataset.addTo);
      if (entry) openEditor(entry.id, {navigateTo: entry.groupIndex});
      return;
    }

    switch (control.dataset.action) {
      case 'close':
        closeDialog();
        break;
      case 'new':
        startAdd();
        break;
      case 'areas':
        if (history.state?.mandalartFrom === '#areas') history.back();
        else switchView('areas');
        break;
      case 'refresh-mate':
        mateError = '';
        $('home-board').innerHTML = homePanel();
        refreshHome();
        break;
      case 'blank':
        confirmChange('빈 목표판에서 시작할까요?', '현재 목표, 완료 기록, 인증 사진을 모두 지우고 새로 시작해요.', async () => {
          const empty = model.createBoard();
          await persist(empty);
          const previous = board;
          board = empty;
          window.Mates.changed(previous, board);
          activeGroup = null;
        }, '빈 목표판을 만들었어요.', '새로 시작');
        break;
      case 'share':
        openShare();
        break;
      case 'share-back':
        if (prepared) openShare(prepared.selection, prepared.withPhotos);
        break;
      case 'send':
        if (prepared) {
          try {
            await navigator.share({files: [prepared.file]});
          } catch (error) {
            if (error.name !== 'AbortError' && $('form-error')) $('form-error').textContent = '공유하지 못했어요. 이미지를 저장해 보낼 수 있어요.';
          }
        }
        break;
      case 'copy':
        copyShareText();
        break;
      case 'save-share-image':
        if (prepared) download(prepared.file, prepared.file.name);
        break;
      case 'images':
        showDialog('이미지 저장', '', '<div class="image-actions">' +
          actionButton('export', '9×9 전체판 저장', 'primary') + actionButton('share', '고른 목표를 이미지로 저장') + '</div>');
        break;
      case 'export':
        try {
          const blob = await boardImage();
          download(blob, '내-만다라트.png');
          closeDialog();
          toast('목표판 이미지 다운로드를 시작했어요.');
        } catch {
          toast('이미지를 만들지 못했어요. 다시 시도해 주세요.');
        }
        break;
    }
  });

  dialog.addEventListener('cancel', event => {
    if (savePending) event.preventDefault();
  });
  dialog.addEventListener('close', clearPreview);
  window.addEventListener('popstate', () => {
    if (dialog.open && !savePending) dialog.close();
    showScreen();
  });

  async function start() {
    const exportButton = document.querySelector('[data-action="images"]');
    exportButton.innerHTML = icon('download');
    try {
      const saved = await loadBoard();
      if (saved?.version === 1) {
        board = saved;
        if (model.seedSamplePhotos(board)) await persist(board);
      }
    } catch {
      toast('저장한 목표를 불러오지 못했어요.');
    }
    const invite = new URL(location.href).searchParams.get('mate');
    if (/^[A-F0-9]{14}$/.test(invite ?? '') && location.hash !== '#mates') {
      history.replaceState(history.state, '', '#mates');
    }
    loading = false;
    window.Mates.configure({board: () => board, label: entryLabel, icon, escape, dialog: showDialog,
      close: closeDialog, toast, refresh: render});
    readScreen();
    render();
    if (view === 'mates') window.Mates.open();
    if (view === 'board') refreshHome();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  start();
})();
