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
    chart: '<path d="M4 19V5m0 14h16M8 15l4-4 3 2 5-6"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    edit: '<path d="m14 6 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/>',
    device: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 17h4"/>',
    download: '<path d="M12 4v11m-4-4 4 4 4-4M5 17v3h14v-3"/>'
  };
  const navigation = [
    ['board', 'grid', '목표판'],
    ['completed', 'checkCircle', '완료 기록'],
    ['share', 'share', '공유하기']
  ];

  let board = model.createBoard(true);
  let view = 'board';
  let activeGroup = null;
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
    board = nextBoard;
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
  }

  function groupLabel(index) {
    return board.goals[index].main.text || '영역 ' + (index + 1);
  }

  function entryLabel(entry) {
    if (entry.kind === 'core') return '중심 목표';
    if (entry.kind === 'goal') return '영역 목표';
    return groupLabel(entry.groupIndex);
  }

  function navMarkup() {
    return navigation.map(([id, symbol, label]) => {
      const action = id === 'share' ? 'data-action="share"' : 'data-view="' + id + '"';
      const current = id === view ? ' aria-current="page"' : '';
      return '<button type="button" class="nav-button" ' + action + current + '>' + icon(symbol) + '<span>' + label + '</span></button>';
    }).join('');
  }

  function sectionsMarkup(includeAll) {
    const all = includeAll ? '<button type="button" class="section-button" data-group="all" aria-pressed="' + (activeGroup === null) + '">전체</button>' : '';
    return all + board.goals.map((group, index) => {
      const color = model.palettes[group.block][3];
      return '<button type="button" class="section-button" data-group="' + index + '" aria-pressed="' + (view === 'board' && activeGroup === index) + '"><span class="section-dot" style="--accent:' + color + '"></span><span class="section-label">' + escape(groupLabel(index)) + '</span></button>';
    }).join('');
  }

  function cardHeading(symbol, title) {
    return '<div class="card-head"><div class="card-icon">' + icon(symbol) + '</div><h2>' + title + '</h2></div>';
  }

  function dateLabel(date) {
    return new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric'}).format(new Date(date));
  }

  function recentRow(entry, showPhoto) {
    const photo = showPhoto && entry.goal.photo
      ? '<img src="' + escape(entry.goal.photo) + '" alt="완료 인증 사진" loading="lazy">' : '';
    return '<button type="button" class="recent-row" data-edit="' + entry.id + '">' +
      '<span class="recent-check">' + icon('check') + '</span>' +
      '<span class="recent-copy"><strong>' + escape(entry.goal.text) + '</strong><small>' +
      escape(entryLabel(entry)) + ' · ' + dateLabel(entry.goal.doneAt) + '</small></span>' + photo + '</button>';
  }

  function renderInsights(stats) {
    const circle = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="33" fill="none" stroke="#e9efe5" stroke-width="8"/>' +
      '<circle cx="40" cy="40" r="33" fill="none" stroke="#4d8755" stroke-width="8" stroke-linecap="round" pathLength="100" stroke-dasharray="' + stats.percent + ' 100"' +
      (stats.percent === 0 ? ' opacity="0"' : '') + '/></svg>';
    const recent = stats.completed.length
      ? '<div class="recent-list">' + stats.completed.slice(0, 3).map(entry => recentRow(entry, false)).join('') + '</div>'
      : '<p class="empty-note">완료한 목표가 여기에 표시돼요.</p>';
    $('insights').innerHTML =
      '<section class="panel progress-card">' + cardHeading('chart', '실행 목표 진행률') +
      '<div class="progress-body"><div class="ring">' + circle + '<strong>' + stats.percent + '%</strong></div>' +
      '<div class="progress-text"><strong>' + stats.done + ' / ' + stats.total + '개</strong><p>등록한 실행 목표 기준</p></div></div>' +
      '<div class="metrics"><div class="metric"><strong>' + stats.done + '</strong>완료</div><div class="metric"><strong>' + (stats.total - stats.done) + '</strong>남은 목표</div></div></section>' +
      '<section class="panel">' + cardHeading('checkCircle', '최근 완료') + recent +
      (stats.completed.length ? '<button type="button" class="text-button" data-view="completed">완료 기록 보기</button>' : '') + '</section>' +
      '<section class="panel share-card">' + cardHeading('share', '친구와 목표 공유') +
      '<p>보여주고 싶은 목표를 골라 이미지로 보내세요.</p><button type="button" class="button secondary" data-action="share">' +
      icon('share') + ' 공유할 목표 고르기</button></section>';
  }

  function renderBoard() {
    const art = '<div class="hero-art" aria-hidden="true">' + Array.from({length: 9}, (_, index) => '<i>' + (index === 4 ? icon('check') : '') + '</i>').join('') + '</div>';
    const headline = board.core.text || '중심 목표를 정해 볼까요?';
    const subtitle = board.sample ? '칸을 눌러 예시를 편집하거나, 빈 목표판에서 시작하세요.' : '중심 목표를 8가지 영역과 작은 실행으로 나눠보세요.';
    const sample = board.sample ? '<button type="button" class="sample-chip" data-action="blank">예시 비우고 시작</button>' : '';
    const blocks = Array.from({length: 9}, (_, block) => {
      const colors = model.palettes[block];
      const selected = activeGroup === null || block === 4 ? '' : model.groups[activeGroup] === block ? ' selected' : ' dim';
      const cells = Array.from({length: 9}, (_, position) => {
        const entry = model.boardCell(board, block, position);
        const goal = entry.goal;
        const accent = block === 4 && position !== 4 ? ' style="--block:' + model.palettes[position][0] + '"' : '';
        const cellType = entry.kind === 'action' ? '' : ' ' + entry.kind;
        const name = entry.kind === 'action' ? entryLabel(entry) + ' 실행 목표' : entryLabel(entry);
        const label = name + (goal.text ? ' · ' + goal.text : ' 추가') + (goal.doneAt ? ' · 완료' : '');
        const mark = goal.doneAt ? '<span class="cell-mark">' + icon('check') + '</span>' : '';
        return '<button type="button" class="cell' + cellType + (goal.doneAt ? ' done' : '') + (goal.text ? '' : ' empty') +
          '" data-edit="' + entry.id + '" aria-label="' + escape(label) + '"' + accent + '>' +
          (goal.text ? '<span>' + escape(goal.text) + '</span>' : icon('plus')) + mark + '</button>';
      }).join('');
      return '<div class="block' + selected + '" style="--block:' + colors[0] + ';--cell:' + colors[1] +
        ';--block-line:' + colors[2] + '" role="group" aria-label="' +
        escape(block === 4 ? '중심 목표와 영역 목표' : groupLabel(model.groups.indexOf(block))) + '">' + cells + '</div>';
    }).join('');
    const filter = activeGroup === null ? '' : '<button type="button" class="button subtle" data-group="all">전체 보기</button>';
    return '<section class="hero"><div class="hero-copy"><div class="hero-kicker">' + icon('target') + ' 나의 중심 목표</div>' +
      '<h1>' + escape(headline) + '<button type="button" class="edit-core" data-edit="core" aria-label="중심 목표 편집">' + icon('edit') + '</button></h1>' +
      '<p>' + subtitle + '</p>' + sample + '</div>' + art + '</section>' +
      '<section class="panel board-panel" aria-labelledby="board-title"><div class="board-head"><div><h2 id="board-title">내 만다라트</h2>' +
      '<p>칸을 눌러 목표를 추가하거나 완료를 기록하세요.</p></div>' + filter + '</div>' +
      '<div class="mobile-filters" aria-label="목표 영역">' + sectionsMarkup(true) + '</div>' +
      '<div class="board-scroll"><div class="board' + (activeGroup === null ? '' : ' group-focus') + '" aria-label="9×9 만다라트 목표판">' + blocks + '</div></div>' +
      '<div class="legend"><span><i style="--legend:#1d4734"></i>중심 목표</span><span><i style="--legend:#dce9d8"></i>영역 목표</span>' +
      '<span><i style="--legend:#f3f6ee"></i>실행 목표</span><span><i style="--legend:#6c9e68"></i>완료 표시</span></div></section>';
  }

  function render() {
    const stats = model.progress(board);
    $('side-nav').innerHTML = navMarkup();
    $('mobile-nav').innerHTML = navMarkup();
    $('sections').innerHTML = '<h2 class="side-caption">목표 영역</h2>' + sectionsMarkup(false);
    $('breadcrumb-label').textContent = view === 'board' ? '만다라트' : '완료 기록';
    $('main-view').innerHTML = view === 'board' ? renderBoard() :
      '<section class="panel page-panel"><h1>완료 기록</h1><p>완료한 목표와 인증 사진을 다시 볼 수 있어요.</p>' +
      (stats.completed.length ? '<div class="completed-list">' + stats.completed.map(entry => recentRow(entry, true)).join('') + '</div>'
        : '<p class="empty-note">아직 완료한 목표가 없어요.</p>') + '</section>';
    renderInsights(stats);
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

  function openEditor(id) {
    const entry = model.locate(board, id);
    if (!entry) return;
    const goal = entry.goal;
    const type = entry.kind === 'core' ? '중심 목표' : entry.kind === 'goal' ? '영역 목표' : '실행 목표';
    showDialog(type + (goal.text ? ' 편집' : ' 추가'), entry.kind === 'action' ? entryLabel(entry) : '',
      '<form id="goal-form"><label class="field">목표 이름<input name="text" maxlength="48" required placeholder="목표를 입력하세요" value="' +
      escape(goal.text) + '" autofocus></label>' +
      '<label class="check-line"><input name="done" type="checkbox"' + (goal.doneAt ? ' checked' : '') + '> 완료했어요</label>' +
      '<div class="proof" id="proof"><label class="field">인증 사진<input name="image" type="file" accept="image/*"></label>' +
      '<div id="proof-preview"></div>' + actionButton('remove-photo', '사진 제거') +
      '<p class="dialog-copy">사진은 완료한 목표에 첨부할 수 있어요.</p></div>' +
      '<p class="form-error" id="form-error" role="alert"></p>' +
      dialogActions((goal.text ? actionButton('delete-goal', '목표 삭제', 'secondary danger') : '') +
        actionButton('close', '취소') + '<button type="submit" class="button primary">저장</button>') + '</form>');
    const form = $('goal-form');
    const remove = form.querySelector('[data-action="remove-photo"]');
    let photo = goal.photo;
    let photoTask = null;

    function syncPhoto() {
      $('proof').hidden = !form.elements.done.checked;
      $('proof-preview').innerHTML = photo ? '<img src="' + escape(photo) + '" alt="인증 사진 미리보기">' : '';
      remove.hidden = !photo;
    }
    syncPhoto();
    form.elements.done.addEventListener('change', syncPhoto);
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
      if (!text) {
        $('form-error').textContent = '목표 이름을 입력해 주세요.';
        input.focus();
        return;
      }
      const done = form.elements.done.checked;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      savePending = true;
      try {
        if (done && photoTask) await photoTask;
        await update(next => Object.assign(model.locate(next, id).goal, {
          text, doneAt: done ? goal.doneAt || new Date().toISOString() : null, photo: done ? photo : null
        }));
        dialog.close();
        render();
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
      return canvas.toDataURL('image/jpeg', .77);
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
      (initialSelection?.has(entry.id) ? ' checked' : '') + '><span>' + escape(entry.goal.text) + '</span><small>' +
      escape(entryLabel(entry)) + (entry.goal.doneAt ? ' · 완료' : '') + '</small></label>').join('');
    showDialog('공유할 목표 고르기', '선택한 목표만 공유 이미지에 담겨요.',
      '<div class="share-controls"><button type="button" class="text-button" id="select-all">전체 선택</button>' +
      '<button type="button" class="text-button" id="clear-all">선택 해제</button><span class="share-count" id="share-count" aria-live="polite"></span></div>' +
      '<div class="share-list" id="share-list">' + sharingList + '</div>' +
      '<label class="check-line"><input type="checkbox" id="include-photos"' + (includePhotos ? ' checked' : '') + '> 인증 사진도 포함</label>' +
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
          text: entries.map(entry => (entry.goal.doneAt ? '✓ ' : '□ ') + entry.goal.text).join('\n'),
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

  function boardImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1260;
    canvas.height = 1360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f8f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = canvasFont(27, 750);
    ctx.fillStyle = '#326045';
    ctx.fillText('만다라트 메이트', 60, 65);
    ctx.font = canvasFont(42, 850);
    ctx.fillStyle = '#1e2b23';
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
        const fill = isCore ? '#1d4734' : entry.kind === 'goal' ? model.palettes[block === 4 ? pos : block][0] : colors[1];
        rectangle(ctx, cx, cy, 120, 120, 6, fill);
        if (entry.goal.doneAt) {
          rectangle(ctx, cx + 92, cy + 5, 22, 22, 11, '#28553c');
          ctx.font = canvasFont(16, 750);
          ctx.fillStyle = '#fff';
          ctx.fillText('✓', cx + 103, cy + 16);
        }
        ctx.font = canvasFont(18, isCore ? 800 : 650);
        ctx.fillStyle = isCore ? '#fff' : '#25382b';
        const lines = writeLines(ctx, entry.goal.text, 104, 4);
        lines.forEach((line, i) => ctx.fillText(line, cx + 60, cy + 60 + (i - (lines.length - 1) / 2) * 20));
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
      const lines = writeLines(ctx, entry.goal.text, hasPhoto ? 490 : 610, 4);
      return {entry, hasPhoto, lines, height: Math.max(hasPhoto ? 112 : 82, 53 + lines.length * 30)};
    });
    canvas.height = 158 + items.reduce((sum, item) => sum + item.height + 8, 0) + 22;
    ctx.fillStyle = '#eef3e9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1d4734';
    ctx.font = canvasFont(22, 750);
    ctx.fillText('만다라트 메이트', 42, 52);
    ctx.font = canvasFont(38, 850);
    ctx.fillText('공유한 목표 · ' + entries.length + '개', 42, 106);
    let y = 138;
    for (const item of items) {
      rectangle(ctx, 40, y, 720, item.height, 12, '#ffffff');
      const done = item.entry.goal.doneAt;
      rectangle(ctx, 55, y + 18, 26, 26, 13, done ? '#28553c' : '#e6f0e2');
      ctx.fillStyle = done ? '#ffffff' : '#28553c';
      ctx.font = canvasFont(17, 750);
      ctx.fillText(done ? '✓' : '○', 61, y + 37);
      ctx.fillStyle = '#1e2b23';
      ctx.font = canvasFont(24, 720);
      item.lines.forEach((line, i) => ctx.fillText(line, 92, y + 36 + i * 30));
      ctx.fillStyle = '#526559';
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

  function switchView(next) {
    view = next;
    activeGroup = null;
    render();
    $('main').focus({preventScroll: true});
  }

  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-action], [data-view], [data-edit], [data-group]');
    if (!control || loading || savePending) return;
    if (control.dataset.view) {
      event.preventDefault();
      switchView(control.dataset.view);
      return;
    }
    if (control.dataset.edit) {
      openEditor(control.dataset.edit);
      return;
    }
    if (control.dataset.group) {
      const selected = control.dataset.group === 'all' ? null : Number(control.dataset.group);
      activeGroup = activeGroup === selected ? null : selected;
      view = 'board';
      render();
      const root = control.closest('.mobile-filters') ? document.querySelector('.mobile-filters') : $('sections');
      root.querySelector('[data-group="' + (activeGroup ?? 'all') + '"]')?.focus({preventScroll: true});
      return;
    }

    switch (control.dataset.action) {
      case 'close':
        closeDialog();
        break;
      case 'new': {
        const id = model.nextSlot(board, activeGroup);
        if (id) openEditor(id);
        else toast('모든 칸이 채워졌어요. 목표판에서 기존 목표를 편집할 수 있어요.');
        break;
      }
      case 'blank':
        confirmChange('빈 목표판에서 시작할까요?', '현재 목표, 완료 기록, 인증 사진을 모두 지우고 새로 시작해요.', async () => {
          const empty = model.createBoard();
          await persist(empty);
          board = empty;
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
      case 'export':
        try {
          const blob = await boardImage();
          download(blob, '내-만다라트.png');
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

  async function start() {
    $('device-icon').innerHTML = icon('device');
    const exportButton = document.querySelector('[data-action="export"]');
    exportButton.innerHTML = icon('download') + '<span>이미지 저장</span>';
    exportButton.setAttribute('aria-label', '목표판 이미지 저장');
    document.querySelector('[data-action="new"]').innerHTML = icon('plus') + ' 새 목표';
    try {
      const saved = await loadBoard();
      if (saved?.version === 1) board = saved;
    } catch {
      toast('저장한 목표를 불러오지 못했어요.');
    }
    loading = false;
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  start();
})();
